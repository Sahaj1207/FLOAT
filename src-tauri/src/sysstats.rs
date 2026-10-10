//! CPU, memory and network throughput for the Home stats strip.
//!
//! Sampled on demand: the frontend polls while the widget is visible, and
//! each call reports usage since the previous one. Nothing runs otherwise.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use sysinfo::{Networks, System};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// 0..100 across all cores.
    cpu: f32,
    memory_used: u64,
    memory_total: u64,
    /// Bytes per second since the previous sample.
    down: f64,
    up: f64,
}

struct Sampler {
    system: System,
    networks: Networks,
    at: Instant,
}

static SAMPLER: Mutex<Option<Sampler>> = Mutex::new(None);

/// Virtual adapters would double-count traffic that also crosses a real one.
fn is_virtual(name: &str) -> bool {
    let n = name.to_lowercase();
    ["loopback", "vethernet", "virtual", "wsl", "hyper-v", "npcap", "vmware", "virtualbox", "pseudo", "teredo", "isatap"]
        .iter()
        .any(|k| n.contains(k))
}

#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    let mut guard = SAMPLER.lock().unwrap();
    let sampler = guard.get_or_insert_with(|| {
        let mut system = System::new();
        system.refresh_cpu_usage();
        Sampler { system, networks: Networks::new_with_refreshed_list(), at: Instant::now() }
    });

    let elapsed = sampler.at.elapsed().as_secs_f64().max(0.001);
    sampler.at = Instant::now();
    sampler.system.refresh_cpu_usage();
    sampler.system.refresh_memory();
    sampler.networks.refresh(true);

    let (mut down, mut up) = (0u64, 0u64);
    for (name, data) in sampler.networks.iter() {
        if !is_virtual(name) {
            down += data.received();
            up += data.transmitted();
        }
    }
    SystemStats {
        cpu: sampler.system.global_cpu_usage(),
        memory_used: sampler.system.used_memory(),
        memory_total: sampler.system.total_memory(),
        down: down as f64 / elapsed,
        up: up as f64 / elapsed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_stats() {
        get_system_stats();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let s = get_system_stats();
        println!("cpu={:.1}% mem={}/{} MB down={:.0} up={:.0} B/s", s.cpu, s.memory_used >> 20, s.memory_total >> 20, s.down, s.up);
        assert!(s.memory_total > 0 && s.memory_used <= s.memory_total);
        assert!((0.0..=100.0).contains(&s.cpu));
    }
}
