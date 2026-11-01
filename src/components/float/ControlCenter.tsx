import React, { useEffect, useState } from "react";
import { ShortcutsRow } from "./Shortcuts";
import {
  ConnectivityState,
  getBrightness,
  getPowerState,
  getSystemStats,
  setBrightness,
  subscribeToBrightness,
  getVolume,
  openSettingsPage,
  PowerPayload,
  setRadio,
  setVolume,
  subscribeToPower,
  subscribeToVolumeChanged,
  SystemStats,
  toggleMute,
  VolumeState,
} from "../../platform";
import { useConnectivity } from "./useConnectivity";
import { BluetoothList, WifiList } from "./NetworkLists";
import { Bluetooth, ChevronRight, Moon, Settings, Sun, Volume1, Volume2, VolumeX, Zap } from "lucide-react";
import "./ControlCenter.css";

/* ---- Icons ---------------------------------------------------------------- */

const WifiIcon: React.FC<{ bars?: number | null; off?: boolean }> = ({ bars = 5, off }) => {
  // Light up arcs by signal strength (0-5 bars mapped onto 3 arcs).
  const lit = off ? 0 : bars == null ? 3 : Math.max(1, Math.ceil((bars / 5) * 3));
  const arc = (i: number) => ({ opacity: i <= lit ? 1 : 0.35 });
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M2 8.8a15 15 0 0 1 20 0" style={arc(3)} />
      <path d="M5.5 12.4a10 10 0 0 1 13 0" style={arc(2)} />
      <path d="M9 16a5 5 0 0 1 6 0" style={arc(1)} />
      <circle cx="12" cy="19.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
};

/* ---- Radio toggling --------------------------------------------------------- */

function useRadioToggle(state: ConnectivityState | null, update: (s: ConnectivityState) => void) {
  const [busy, setBusy] = useState<"wifi" | "bluetooth" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (kind: "wifi" | "bluetooth") => {
    if (!state || busy) return;
    setBusy(kind);
    setError(null);
    setRadio(kind, !state[kind].on)
      .then(update)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(null));
  };
  return { toggle, busy, error };
}

const wifiCaption = (s: ConnectivityState) => (!s.wifi.on ? "Off" : s.wifi.ssid ?? (s.wired ? "Wired" : "Not connected"));

const bluetoothCaption = (s: ConnectivityState) =>
  !s.bluetooth.on
    ? "Off"
    : s.bluetooth.devices.length === 1
    ? s.bluetooth.devices[0]
    : s.bluetooth.devices.length > 1
    ? `${s.bluetooth.devices.length} devices`
    : "On";

const stop = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  fn();
};

/* ---- Building blocks (macOS Control Center) -------------------------------- */

/**
 * One connectivity line: a round toggle (blue when on), the name and state,
 * and a chevron that opens the list, like Wi-Fi in Control Center.
 */
const ToggleLine: React.FC<{
  on: boolean;
  busy?: boolean;
  icon: React.ReactNode;
  title: string;
  caption: string;
  onToggle: () => void;
  onMore?: () => void;
  tint?: string;
}> = ({ on, busy, icon, title, caption, onToggle, onMore, tint = "var(--tint)" }) => (
  <div className="cc-line">
    <button
      type="button"
      className={`cc-round ${on ? "on" : ""} ${busy ? "busy" : ""}`}
      style={on ? { background: tint } : undefined}
      onClick={stop(onToggle)}
      data-no-drag="true"
      aria-label={`${title} ${on ? "on" : "off"}`}
      aria-pressed={on}
    >
      {icon}
    </button>
    <button type="button" className="cc-line-text" onClick={stop(onMore ?? onToggle)} data-no-drag="true">
      <span className="cc-line-title">{title}</span>
      <span className="cc-line-caption">{caption}</span>
    </button>
    {onMore && (
      <button type="button" className="cc-more" onClick={stop(onMore)} data-no-drag="true" aria-label={`${title} options`}>
        <ChevronRight size={14} strokeWidth={2.4} />
      </button>
    )}
  </div>
);

/**
 * Control Center's thick slider: a pill that fills white from the left, with
 * its icon inside the track. The icon is also a button (mute).
 */
const PillSlider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  icon: React.ReactNode;
  onIcon?: () => void;
  label: string;
}> = ({ value, onChange, icon, onIcon, label }) => (
  <div className="cc-pill" onClick={(e) => e.stopPropagation()}>
    <span className="cc-pill-fill" style={{ width: `${Math.max(value, 0)}%` }} />
    <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-no-drag="true" />
    <button type="button" className={`cc-pill-icon ${value > 8 ? "covered" : ""}`} onClick={stop(() => onIcon?.())} data-no-drag="true" tabIndex={onIcon ? 0 : -1} aria-label={onIcon ? "Mute" : label}>
      {icon}
    </button>
  </div>
);

/** A small ring, Apple Watch-style, with a value inside. */
const Ring: React.FC<{ percent: number; color: string; children: React.ReactNode }> = ({ percent, color, children }) => {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="cc-ring">
      <svg viewBox="0 0 34 34" width="34" height="34">
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--fill-2)" strokeWidth="3.4" />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span className="cc-ring-inner">{children}</span>
    </span>
  );
};

function useStats(): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => getSystemStats().then((s) => live && s && setStats(s));
    load();
    const timer = setInterval(load, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return stats;
}

/* ---- Controls tab ------------------------------------------------------------- */

export const ControlsView: React.FC<{ focusActive: boolean; onOpenSettings: () => void; onCollapse: () => void }> = ({
  focusActive,
  onOpenSettings,
  onCollapse,
}) => {
  const [state, update] = useConnectivity();
  const { toggle, busy, error } = useRadioToggle(state, update);
  const [volume, setVolumeState] = useState<VolumeState | null>(null);
  const [power, setPower] = useState<PowerPayload | null>(null);
  const [brightness, setBrightnessState] = useState<number | null>(null);
  const [list, setList] = useState<"wifi" | "bluetooth" | null>(null);
  const stats = useStats();

  useEffect(() => {
    let isMounted = true;
    getBrightness().then((b) => isMounted && setBrightnessState(b));
    const unlistenBrightness = subscribeToBrightness((b) => isMounted && setBrightnessState(b));
    getVolume().then((v) => isMounted && setVolumeState(v));
    getPowerState().then((p) => isMounted && setPower(p));
    const unlistenVolume = subscribeToVolumeChanged((v) => isMounted && setVolumeState(v));
    const unlistenPower = subscribeToPower((p) => isMounted && setPower(p));
    return () => {
      isMounted = false;
      unlistenVolume.then((fn) => fn());
      unlistenBrightness.then((fn) => fn());
      unlistenPower.then((fn) => fn());
    };
  }, []);

  if (list === "wifi") {
    return <WifiList onBack={() => setList(null)} onConnected={update} />;
  }
  if (list === "bluetooth") {
    return <BluetoothList onBack={() => setList(null)} connected={state?.bluetooth.devices ?? []} />;
  }

  const level = volume ? Math.round(volume.level * 100) : 0;
  const shownVolume = volume?.muted ? 0 : level;
  const SpeakerIcon = !volume || volume.muted || level === 0 ? VolumeX : level < 50 ? Volume1 : Volume2;
  const memory = stats ? Math.round((stats.memoryUsed / stats.memoryTotal) * 100) : 0;

  return (
    <div className="cc-view">
      <ShortcutsRow onDone={onCollapse} />

      {/* Connectivity */}
      <div className="cc-module cc-connect">
        {state?.wifi.available && (
          <ToggleLine
            on={state.wifi.on}
            busy={busy === "wifi"}
            icon={<WifiIcon bars={state.wifi.signal} off={!state.wifi.on} />}
            title="Wi-Fi"
            caption={wifiCaption(state)}
            onToggle={() => toggle("wifi")}
            onMore={() => setList("wifi")}
          />
        )}
        {state?.bluetooth.available && (
          <ToggleLine
            on={state.bluetooth.on}
            busy={busy === "bluetooth"}
            icon={<Bluetooth size={15} strokeWidth={2.4} />}
            title="Bluetooth"
            caption={bluetoothCaption(state)}
            onToggle={() => toggle("bluetooth")}
            onMore={() => setList("bluetooth")}
          />
        )}
        <ToggleLine
          on={focusActive}
          icon={<Moon size={14} strokeWidth={0} fill="currentColor" />}
          title="Focus"
          caption={focusActive ? "On" : "Off"}
          tint="#5e5ce6"
          // Windows doesn't let apps switch Focus; open its settings.
          onToggle={() => openSettingsPage("quiethours")}
        />
        {error && <span className="cc-error">{error}</span>}
      </div>

      {/* Display and Sound */}
      <div className="cc-module cc-slider-module cc-display">
        <span className="cc-module-title">Display</span>
        <PillSlider
          label="Brightness"
          value={brightness ?? 0}
          icon={<Sun size={14} strokeWidth={2.4} />}
          onChange={(v) => {
            setBrightnessState(v);
            setBrightness(v);
          }}
        />
      </div>
      <div className="cc-module cc-slider-module cc-sound">
        <span className="cc-module-title">
          Sound
          <button type="button" className="cc-more inline" onClick={stop(() => openSettingsPage("sound"))} data-no-drag="true" aria-label="Sound settings">
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        </span>
        <PillSlider
          label="Volume"
          value={shownVolume}
          icon={<SpeakerIcon size={14} strokeWidth={2.4} />}
          onIcon={() => toggleMute().then((v) => v && setVolumeState(v))}
          onChange={(v) => {
            if (!volume) return;
            setVolumeState({ ...volume, level: v / 100, muted: false });
            setVolume(v / 100);
          }}
        />
      </div>

      {/* Small modules */}
      <div className="cc-smalls">
        <div className="cc-module cc-small" title={power ? `${power.percent}% ${power.charging ? "charging" : "battery"}` : "Plugged in"}>
          <Ring percent={power?.percent ?? 100} color={power?.charging || !power ? "#30d158" : (power?.percent ?? 100) <= 20 ? "#ff453a" : "#fff"}>
            {power?.charging ? <Zap size={11} strokeWidth={0} fill="currentColor" /> : null}
          </Ring>
          <span className="cc-small-text">
            <b>{power ? `${power.percent}%` : "AC"}</b>
            <span>{power ? (power.charging ? "Charging" : "Battery") : "Power"}</span>
          </span>
        </div>
        <div className="cc-module cc-small" title={stats ? `CPU ${Math.round(stats.cpu)}% · memory ${memory}%` : "Activity"}>
          <Ring percent={stats?.cpu ?? 0} color="var(--tint)">
            <span className="cc-ring-num">{stats ? Math.round(stats.cpu) : "–"}</span>
          </Ring>
          <span className="cc-small-text">
            <b>CPU</b>
            <span>RAM {stats ? `${memory}%` : "–"}</span>
          </span>
        </div>
        <button type="button" className="cc-module cc-small cc-gear" onClick={stop(onOpenSettings)} data-no-drag="true" aria-label="FLOAT Settings">
          <Settings size={18} strokeWidth={2} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};
