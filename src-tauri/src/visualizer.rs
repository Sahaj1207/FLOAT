//! Live audio levels for the equalizer, from WASAPI loopback capture of the
//! default output device.
//!
//! Capture only runs while the frontend has a playing equalizer on screen
//! (`set_visualizer_active`). Samples are split into three bands with
//! one-pole filters, and per-band RMS is normalized by a slow peak follower
//! so quiet and loud tracks both fill the bars. Levels are emitted ~30 times
//! per second as `audio-levels`.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BANDS: usize = 3;
/// Band split points in Hz: low < 200 <= mid < 2000 <= high.
const LOW_CUTOFF: f32 = 200.0;
const HIGH_CUTOFF: f32 = 2000.0;
const EMIT_EVERY: Duration = Duration::from_millis(33);
const DEVICE_CHECK_EVERY: Duration = Duration::from_secs(2);
const SILENCE_RMS: f32 = 1e-4;

#[derive(Default)]
struct Accumulator {
    sum_sq: [f32; BANDS],
    count: u32,
}

#[derive(Clone, Serialize)]
struct LevelsPayload {
    levels: [f32; BANDS],
    silent: bool,
}

static ACTIVE: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<()> = OnceLock::new();

/// One-pole low-pass coefficient for a cutoff at the given sample rate.
fn lowpass_alpha(cutoff: f32, rate: f32) -> f32 {
    let dt = 1.0 / rate;
    let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff);
    dt / (rc + dt)
}

struct Capture {
    _stream: cpal::Stream,
    device_name: String,
    failed: Arc<AtomicBool>,
}

fn start_capture(accum: Arc<Mutex<Accumulator>>) -> Option<Capture> {
    let host = cpal::default_host();
    let device = host.default_output_device()?;
    let device_name = device.name().unwrap_or_default();
    let config = device.default_output_config().ok()?;
    let channels = config.channels() as usize;
    let rate = config.sample_rate().0 as f32;
    let (a_low, a_high) = (lowpass_alpha(LOW_CUTOFF, rate), lowpass_alpha(HIGH_CUTOFF, rate));
    let failed = Arc::new(AtomicBool::new(false));

    let mut lp_low = 0.0f32;
    let mut lp_high = 0.0f32;
    let mut process = move |mono: &mut dyn Iterator<Item = f32>| {
        let mut local = [0.0f32; BANDS];
        let mut n = 0u32;
        for x in mono {
            lp_low += a_low * (x - lp_low);
            lp_high += a_high * (x - lp_high);
            let bands = [lp_low, lp_high - lp_low, x - lp_high];
            for (acc, b) in local.iter_mut().zip(bands) {
                *acc += b * b;
            }
            n += 1;
        }
        if let Ok(mut acc) = accum.lock() {
            for (total, l) in acc.sum_sq.iter_mut().zip(local) {
                *total += l;
            }
            acc.count += n;
        }
    };

    let failed_cb = failed.clone();
    let on_error = move |e| {
        dlog!("[VISUALIZER] stream error: {}", e);
        failed_cb.store(true, Ordering::Relaxed);
    };
    // Building an input stream on an output device gives a loopback capture.
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| {
                let mut mono = data.chunks(channels).map(|f| f.iter().sum::<f32>() / channels as f32);
                process(&mut mono);
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| {
                let mut mono = data
                    .chunks(channels)
                    .map(|f| f.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32);
                process(&mut mono);
            },
            on_error,
            None,
        ),
        other => {
            dlog!("[VISUALIZER] unsupported sample format {:?}", other);
            return None;
        }
    }
    .ok()?;
    stream.play().ok()?;
    dlog!("[VISUALIZER] capturing {} @ {} Hz", device_name, rate);
    Some(Capture { _stream: stream, device_name, failed })
}

/// Owns the (non-Send) capture stream; starts and stops it as ACTIVE changes.
fn run(app: AppHandle) {
    let accum = Arc::new(Mutex::new(Accumulator::default()));
    let mut capture: Option<Capture> = None;
    let mut peaks = [SILENCE_RMS; BANDS];
    let mut smoothed = [0.0f32; BANDS];
    let mut last_device_check = Instant::now();
    let mut retry_at = Instant::now();

    loop {
        std::thread::sleep(EMIT_EVERY);
        let active = ACTIVE.load(Ordering::Relaxed);

        if !active {
            if capture.take().is_some() {
                dlog!("[VISUALIZER] stopped");
            }
            continue;
        }

        // Rebuild after errors or when the default output device changes.
        if let Some(c) = &capture {
            let device_changed = last_device_check.elapsed() >= DEVICE_CHECK_EVERY && {
                last_device_check = Instant::now();
                cpal::default_host()
                    .default_output_device()
                    .and_then(|d| d.name().ok())
                    .is_some_and(|name| name != c.device_name)
            };
            if c.failed.load(Ordering::Relaxed) || device_changed {
                capture = None;
                retry_at = Instant::now();
            }
        }
        if capture.is_none() && Instant::now() >= retry_at {
            capture = start_capture(accum.clone());
            if capture.is_none() {
                retry_at = Instant::now() + Duration::from_secs(2);
            }
        }

        let (sum_sq, count) = match accum.lock() {
            Ok(mut acc) => (std::mem::take(&mut acc.sum_sq), std::mem::take(&mut acc.count)),
            Err(_) => continue,
        };
        if count == 0 {
            // WASAPI loopback delivers nothing while the device is silent.
            let _ = app.emit("audio-levels", LevelsPayload { levels: [0.0; BANDS], silent: true });
            continue;
        }

        let mut levels = [0.0f32; BANDS];
        let mut silent = true;
        for b in 0..BANDS {
            let rms = (sum_sq[b] / count as f32).sqrt();
            if rms > SILENCE_RMS {
                silent = false;
            }
            // Fast attack, slow release on the normalizing peak.
            peaks[b] = if rms > peaks[b] { rms } else { (peaks[b] * 0.996).max(SILENCE_RMS) };
            let target = (rms / peaks[b]).powf(0.8).min(1.0);
            let k = if target > smoothed[b] { 0.6 } else { 0.25 };
            smoothed[b] += (target - smoothed[b]) * k;
            levels[b] = smoothed[b];
        }
        let _ = app.emit("audio-levels", LevelsPayload { levels, silent });
    }
}

#[tauri::command]
pub fn set_visualizer_active(app: AppHandle, active: bool) {
    ACTIVE.store(active, Ordering::Relaxed);
    if active {
        STARTED.get_or_init(|| {
            let _ = std::thread::Builder::new()
                .name("visualizer".into())
                .spawn(move || run(app));
        });
    }
}
