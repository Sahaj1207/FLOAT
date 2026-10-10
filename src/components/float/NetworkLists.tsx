import React, { useCallback, useEffect, useState } from "react";
import {
  BluetoothDeviceInfo,
  ConnectivityState,
  getBluetoothDevices,
  getWifiNetworks,
  openSettingsPage,
  wifiConnect,
  WifiNetwork,
} from "../../platform";
import "./NetworkLists.css";

const Header: React.FC<{ title: string; onBack: () => void; right?: React.ReactNode }> = ({ title, onBack, right }) => (
  <div className="nl-header">
    <button
      type="button"
      className="nl-back"
      onClick={(e) => {
        e.stopPropagation();
        onBack();
      }}
      data-no-drag="true"
      aria-label="Back to controls"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 5-7 7 7 7" />
      </svg>
    </button>
    <span className="nl-title">{title}</span>
    <span className="nl-right">{right}</span>
  </div>
);

const SignalBars: React.FC<{ bars: number }> = ({ bars }) => (
  <span className="nl-bars" aria-label={`${bars} of 5 bars`}>
    {[1, 2, 3, 4].map((i) => (
      <span key={i} className={bars >= i + 1 || (i === 1 && bars >= 1) ? "on" : ""} style={{ height: 3 + i * 2.5 }} />
    ))}
  </span>
);

const LockIcon = () => (
  <svg className="nl-lock" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 9V7A5 5 0 0 0 7 7v2H5v12h14V9h-2zm-8-2a3 3 0 0 1 6 0v2H9V7z" />
  </svg>
);

/** Nearby Wi-Fi networks; click to join (asks for a password when needed). */
export const WifiList: React.FC<{ onBack: () => void; onConnected: (s: ConnectivityState) => void }> = ({
  onBack,
  onConnected,
}) => {
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const load = useCallback((rescan: boolean) => {
    setScanning(rescan);
    getWifiNetworks(rescan)
      .then((list) => {
        setNetworks(list);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setScanning(false));
  }, []);

  // Show the last known list instantly, then refresh with a real scan.
  useEffect(() => {
    getWifiNetworks(false)
      .then(setNetworks)
      .catch(() => {})
      .finally(() => load(true));
  }, [load]);

  const connect = (ssid: string, pass?: string) => {
    setBusy(ssid);
    setError(null);
    wifiConnect(ssid, pass)
      .then((state) => {
        setAskPassword(null);
        setPassword("");
        onConnected(state);
        load(false);
      })
      .catch((e) => {
        if (String(e).includes("password-required")) {
          setAskPassword(ssid);
          if (pass) setError("That password didn't work");
        } else {
          setError(String(e));
        }
      })
      .finally(() => setBusy(null));
  };

  return (
    <div className="nl-view">
      <Header
        title="Wi-Fi"
        onBack={onBack}
        right={
          <button
            type="button"
            className="nl-action"
            disabled={scanning}
            onClick={(e) => {
              e.stopPropagation();
              load(true);
            }}
            data-no-drag="true"
          >
            {scanning ? "Scanning…" : "Refresh"}
          </button>
        }
      />
      {error && <div className="nl-error">{error}</div>}
      <div className="nl-list">
        {networks === null && <div className="nl-empty">Looking for networks…</div>}
        {networks?.length === 0 && !scanning && <div className="nl-empty">No networks found</div>}
        {networks?.map((n) => (
          <div key={n.ssid} className={`nl-row-wrap ${askPassword === n.ssid ? "open" : ""}`}>
            <button
              type="button"
              className={`nl-row ${n.connected ? "connected" : ""}`}
              disabled={busy !== null}
              onClick={(e) => {
                e.stopPropagation();
                if (!n.connected) connect(n.ssid);
              }}
              data-no-drag="true"
            >
              <SignalBars bars={n.signal} />
              <span className="nl-name">{n.ssid}</span>
              {n.secured && <LockIcon />}
              <span className="nl-state">
                {busy === n.ssid ? "Connecting…" : n.connected ? "Connected" : ""}
              </span>
            </button>
            {askPassword === n.ssid && (
              <form
                className="nl-password"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password) connect(n.ssid, password);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="password"
                  autoFocus
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-no-drag="true"
                  aria-label={`Password for ${n.ssid}`}
                />
                <button type="submit" disabled={!password || busy !== null} data-no-drag="true">
                  Join
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setAskPassword(null);
                    setPassword("");
                    setError(null);
                  }}
                  data-no-drag="true"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Paired Bluetooth devices. Connecting goes through Windows' own flyout. */
export const BluetoothList: React.FC<{ onBack: () => void; connected: string[] }> = ({ onBack, connected }) => {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[] | null>(null);

  // Refresh whenever the connected set changes.
  const connectedKey = connected.join("|");
  useEffect(() => {
    let cancelled = false;
    getBluetoothDevices().then((list) => !cancelled && setDevices(list));
    return () => {
      cancelled = true;
    };
  }, [connectedKey]);

  return (
    <div className="nl-view">
      <Header
        title="Bluetooth"
        onBack={onBack}
        right={
          <button
            type="button"
            className="nl-action"
            onClick={(e) => {
              e.stopPropagation();
              openSettingsPage("bluetooth");
            }}
            data-no-drag="true"
          >
            Pair new…
          </button>
        }
      />
      <div className="nl-list">
        {devices === null && <div className="nl-empty">Looking for devices…</div>}
        {devices?.length === 0 && <div className="nl-empty">No paired devices yet</div>}
        {devices?.map((d) => (
          <button
            key={d.name}
            type="button"
            className={`nl-row ${d.connected ? "connected" : ""}`}
            title={d.connected ? "Connected" : "Connect using the Windows device flyout"}
            onClick={(e) => {
              e.stopPropagation();
              if (!d.connected) openSettingsPage("connect-devices");
            }}
            data-no-drag="true"
          >
            <span className={`nl-dot ${d.connected ? "on" : ""}`} />
            <span className="nl-name">{d.name}</span>
            <span className="nl-state">{d.connected ? "Connected" : "Connect…"}</span>
          </button>
        ))}
      </div>
      <div className="nl-footnote">Windows only lets its own flyout connect a paired device, so Connect… opens it.</div>
    </div>
  );
};
