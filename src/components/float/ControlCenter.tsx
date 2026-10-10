import React, { useEffect, useState } from "react";
import {
  ConnectivityState,
  getBrightness,
  getPowerState,
  setBrightness,
  subscribeToBrightness,
  getVolume,
  openSettingsPage,
  PowerPayload,
  setRadio,
  setVolume,
  subscribeToPower,
  subscribeToVolumeChanged,
  toggleMute,
  VolumeState,
} from "../../platform";
import { useConnectivity } from "./useConnectivity";
import { SunIcon } from "./StatusHud";
import { BluetoothList, WifiList } from "./NetworkLists";
import { StatsStrip } from "./Widgets";
import { Settings } from "lucide-react";
import "./ControlCenter.css";

/* ---- Icons ---------------------------------------------------------------- */

const WifiIcon: React.FC<{ bars?: number | null; off?: boolean }> = ({ bars = 5, off }) => {
  // Light up arcs by signal strength (0-5 bars mapped onto 3 arcs).
  const lit = off ? 0 : bars == null ? 3 : Math.max(1, Math.ceil((bars / 5) * 3));
  const arc = (i: number) => ({ opacity: i <= lit ? 1 : 0.3 });
  return (
    <svg className="cc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M2 8.8a15 15 0 0 1 20 0" style={arc(3)} />
      <path d="M5.5 12.4a10 10 0 0 1 13 0" style={arc(2)} />
      <path d="M9 16a5 5 0 0 1 6 0" style={arc(1)} />
      <circle cx="12" cy="19.5" r="1.2" fill="currentColor" stroke="none" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
};

const BluetoothIcon: React.FC = () => (
  <svg className="cc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 7 10 10-5 5V2l5 5L7 17" />
  </svg>
);

const SpeakerIcon: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg className="cc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
    {muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
  </svg>
);

const MoonIcon: React.FC = () => (
  <svg className="cc-icon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

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

const wifiCaption = (s: ConnectivityState) =>
  !s.wifi.on ? "Off" : s.wifi.ssid ?? (s.wired ? `${s.wired}` : "Not connected");

const bluetoothCaption = (s: ConnectivityState) =>
  !s.bluetooth.on
    ? "Off"
    : s.bluetooth.devices.length === 1
    ? s.bluetooth.devices[0]
    : s.bluetooth.devices.length > 1
    ? `${s.bluetooth.devices.length} devices`
    : "On";

/* ---- Controls tab ------------------------------------------------------------- */

const Switch: React.FC<{ on: boolean; onToggle: () => void; label: string; disabled?: boolean }> = ({
  on,
  onToggle,
  label,
  disabled,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    className={`float-setting-switch ${on ? "checked" : ""} ${disabled ? "disabled" : ""}`}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    data-no-drag="true"
  >
    <span className="float-setting-switch-handle" />
  </button>
);

const SettingsLink: React.FC<{ page: Parameters<typeof openSettingsPage>[0]; label: string }> = ({ page, label }) => (
  <button
    type="button"
    className="cc-link"
    onClick={(e) => {
      e.stopPropagation();
      openSettingsPage(page);
    }}
    data-no-drag="true"
  >
    {label}
  </button>
);

const ListLink: React.FC<{ label: string; onOpen: () => void }> = ({ label, onOpen }) => (
  <button
    type="button"
    className="cc-link"
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
    data-no-drag="true"
  >
    {label}
  </button>
);

export const ControlsView: React.FC<{ focusActive: boolean; onOpenSettings: () => void }> = ({
  focusActive,
  onOpenSettings,
}) => {
  const [state, update] = useConnectivity();
  const { toggle, busy, error } = useRadioToggle(state, update);
  const [volume, setVolumeState] = useState<VolumeState | null>(null);
  const [power, setPower] = useState<PowerPayload | null>(null);
  const [brightness, setBrightnessState] = useState<number | null>(null);
  const [list, setList] = useState<"wifi" | "bluetooth" | null>(null);

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

  return (
    <div className="cc-view">
      <div className="cc-column">
        {state?.wifi.available && (
          <div className="cc-card">
            <div className="cc-card-head">
              <span className={`cc-badge ${state.wifi.on ? "on" : ""}`}>
                <WifiIcon bars={state.wifi.signal} off={!state.wifi.on} />
              </span>
              <div className="cc-card-title">
                <span>Wi-Fi</span>
                <span className="cc-card-caption">{wifiCaption(state)}</span>
              </div>
              <Switch on={state.wifi.on} onToggle={() => toggle("wifi")} label="Wi-Fi" disabled={busy === "wifi"} />
            </div>
            <ListLink label="Networks…" onOpen={() => setList("wifi")} />
          </div>
        )}
        {state?.bluetooth.available && (
          <div className="cc-card">
            <div className="cc-card-head">
              <span className={`cc-badge ${state.bluetooth.on ? "on" : ""}`}>
                <BluetoothIcon />
              </span>
              <div className="cc-card-title">
                <span>Bluetooth</span>
                <span className="cc-card-caption">{bluetoothCaption(state)}</span>
              </div>
              <Switch
                on={state.bluetooth.on}
                onToggle={() => toggle("bluetooth")}
                label="Bluetooth"
                disabled={busy === "bluetooth"}
              />
            </div>
            {state.bluetooth.devices.length > 1 && (
              <ul className="cc-device-list">
                {state.bluetooth.devices.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <ListLink label="Devices…" onOpen={() => setList("bluetooth")} />
          </div>
        )}
        {error && <span className="cc-error">{error}</span>}
        <StatsStrip />
      </div>

      <div className="cc-column">
        {volume && (
          <div className="cc-card">
            <div className="cc-card-head">
              <button
                type="button"
                className={`cc-badge ${volume.muted ? "" : "on"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute().then((v) => v && setVolumeState(v));
                }}
                data-no-drag="true"
                aria-label={volume.muted ? "Unmute" : "Mute"}
              >
                <SpeakerIcon muted={volume.muted} />
              </button>
              <input
                className="cc-slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(volume.level * 100)}
                onChange={(e) => {
                  const level = Number(e.target.value) / 100;
                  setVolumeState({ ...volume, level });
                  setVolume(level);
                }}
                onClick={(e) => e.stopPropagation()}
                data-no-drag="true"
                aria-label="Volume"
                style={{ "--cc-fill": `${volume.muted ? 0 : Math.round(volume.level * 100)}%` } as React.CSSProperties}
              />
              <span className="cc-value">{volume.muted ? "Muted" : Math.round(volume.level * 100)}</span>
            </div>
          </div>
        )}
        {brightness !== null && (
          <div className="cc-card">
            <div className="cc-card-head">
              <span className="cc-badge sun">
                <SunIcon className="cc-icon" />
              </span>
              <input
                className="cc-slider"
                type="range"
                min={0}
                max={100}
                value={brightness}
                onChange={(e) => {
                  const level = Number(e.target.value);
                  setBrightnessState(level);
                  setBrightness(level);
                }}
                onClick={(e) => e.stopPropagation()}
                data-no-drag="true"
                aria-label="Brightness"
                style={{ "--cc-fill": `${brightness}%`, "--cc-color": "#ffd60a" } as React.CSSProperties}
              />
              <span className="cc-value">{brightness}</span>
            </div>
          </div>
        )}
        <div className="cc-card-row">
          {power && (
            <div className="cc-card cc-mini">
              <span className="cc-mini-value">{power.percent}%</span>
              <span className="cc-card-caption">{power.charging ? "Charging" : "Battery"}</span>
            </div>
          )}
          <button
            type="button"
            className={`cc-card cc-mini cc-mini-button ${focusActive ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              openSettingsPage("quiethours");
            }}
            data-no-drag="true"
            title="Windows doesn't let apps change Focus; opens its settings"
          >
            <span className="cc-mini-value">
              <MoonIcon /> Focus
            </span>
            <span className="cc-card-caption">{focusActive ? "On" : "Off"}</span>
          </button>
        </div>
        <div className="cc-footer">
          <SettingsLink page="sound" label="Sound settings…" />
          <button
            type="button"
            className="chip cc-settings"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            data-no-drag="true"
          >
            <Settings size={13} strokeWidth={2.2} />
            FLOAT Settings
          </button>
        </div>
      </div>
    </div>
  );
};
