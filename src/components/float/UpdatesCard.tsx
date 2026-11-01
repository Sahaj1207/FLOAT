import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkForUpdate, installUpdate, subscribeToUpdateProgress, UpdateInfo } from "../../platform";
import { loadSettings, saveSettings, subscribeToSettings } from "../../services/settings";

// Set by "Check for Updates…" in the tray menu; the card checks on mount.
let pendingCheck = false;
export function requestUpdateCheck() {
  pendingCheck = true;
}

type State =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "checked"; info: UpdateInfo }
  | { step: "downloading"; info: UpdateInfo; percent: number }
  | { step: "opened"; info: UpdateInfo }
  | { step: "error"; message: string; info?: UpdateInfo };

/** First few meaningful lines of the release notes, without Markdown marks. */
function summary(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/\*\*|`/g, "").trim())
    .filter((l) => l.length > 0 && !/^installing$/i.test(l))
    .slice(0, 3);
}

/**
 * Settings › Updates. FLOAT only contacts GitHub when the user presses the
 * button, and installs only when they press Install.
 */
export const UpdatesCard: React.FC = () => {
  const [state, setState] = useState<State>({ step: "idle" });
  const [version, setVersion] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => loadSettings().autoUpdateCheck);
  useEffect(() => subscribeToSettings((s) => setAuto(s.autoUpdateCheck)), []);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let live = true;
    subscribeToUpdateProgress(({ received, total }) => {
      setState((s) =>
        s.step === "downloading" ? { ...s, percent: total > 0 ? Math.round((received / total) * 100) : 0 } : s
      );
    })
      .then((fn) => {
        if (live) unlisten = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      live = false;
      unlisten?.();
    };
  }, []);

  const cardRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pendingCheck) return;
    pendingCheck = false;
    cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = () => {
    setState({ step: "checking" });
    checkForUpdate()
      .then((info) => setState({ step: "checked", info }))
      .catch((e) => setState({ step: "error", message: String(e) }));
  };

  const install = (info: UpdateInfo) => {
    setState({ step: "downloading", info, percent: 0 });
    installUpdate()
      .then(() => setState({ step: "opened", info }))
      .catch((e) => setState({ step: "error", message: String(e), info }));
  };

  const info = "info" in state ? state.info : undefined;

  let status: React.ReactNode;
  switch (state.step) {
    case "idle":
      status = "Check now, or let FLOAT check once a day below";
      break;
    case "checking":
      status = "Checking GitHub…";
      break;
    case "checked":
      status = state.info.available
        ? `FLOAT ${state.info.latest} is available`
        : `You're up to date (latest is ${state.info.latest})`;
      break;
    case "downloading":
      status = `Downloading FLOAT ${state.info.latest}… ${state.percent}%`;
      break;
    case "opened":
      status =
        state.info.channel === "msix"
          ? "The installer is open. Choose Update to finish"
          : "The installer is open. FLOAT will close while it updates";
      break;
    case "error":
      status = state.message;
      break;
  }

  return (
    <div className="float-setting-card" ref={cardRef}>
      <div className="float-setting-label-row">
        <div className="float-setting-label-left">
          <RefreshCw className="float-setting-icon" strokeWidth={2} />
          <span className="float-setting-name">Updates</span>
        </div>
        {version && <span className="float-setting-value-badge">{version}</span>}
      </div>

      <div className="float-setting-toggle-row">
        <div className="float-setting-toggle-left">
          <span className={`float-setting-toggle-desc ${state.step === "error" ? "update-error" : ""}`}>{status}</span>
        </div>
        {state.step === "checked" && state.info.available ? (
          <button type="button" className="chip update-install" onClick={() => install(state.info)} data-no-drag="true">
            Install
          </button>
        ) : (
          <button
            type="button"
            className="chip"
            onClick={check}
            disabled={state.step === "checking" || state.step === "downloading"}
            data-no-drag="true"
          >
            {state.step === "error" && info ? "Try again" : "Check for updates"}
          </button>
        )}
      </div>

      <div className="float-setting-toggle-row">
        <div className="float-setting-toggle-left">
          <span className="float-setting-toggle-title">Check Automatically</span>
          <span className="float-setting-toggle-desc">
            Once a day FLOAT asks GitHub for the latest version number and offers a new version in the island. Nothing about you is sent
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          className={`float-setting-switch ${auto ? "checked" : ""}`}
          onClick={() => saveSettings({ ...loadSettings(), autoUpdateCheck: !auto })}
          data-no-drag="true"
          aria-label="Toggle Check Automatically"
        >
          <span className="float-setting-switch-handle" />
        </button>
      </div>

      {state.step === "downloading" && (
        <div className="update-progress">
          <span style={{ width: `${state.percent}%` }} />
        </div>
      )}

      {info?.available && state.step === "checked" && (
        <div className="update-notes">
          {summary(info.notes).map((line) => (
            <span key={line}>{line}</span>
          ))}
          <button
            type="button"
            className="view-action update-link"
            onClick={() => openUrl(info.page).catch(() => {})}
            data-no-drag="true"
          >
            Full release notes
          </button>
        </div>
      )}
    </div>
  );
};

export default UpdatesCard;
