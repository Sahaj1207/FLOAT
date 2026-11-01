import React, { useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Hand,
  Info,
  Keyboard,
  MousePointer2,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings2,
  Target,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  checkForUpdate,
  clearClipboardHistory,
  getAutostart,
  getCalendarEvents,
  getShortcuts,
  installUpdate,
  openSettingsPage,
  pauseShortcuts,
  setAutostart,
  setShortcut,
  ShortcutAction,
  subscribeToAutostart,
  subscribeToUpdateProgress,
  UpdateInfo,
} from "../platform";
import {
  DEFAULT_FLOAT_SETTINGS,
  FloatSettings,
  GLASS_TINT_MAX,
  GLASS_TINT_MIN,
  loadSettings,
  PILL_LENGTH_MAX,
  PILL_LENGTH_MIN,
  saveSettings,
  subscribeToSettings,
} from "../services/settings";
import { snippetList, useSnippets } from "../activities/snippetsStore";
import { isAppointment } from "../components/float/Widgets";
import { Field, Group, Popup, Row, Segmented, Slider, Switch } from "./controls";

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

/** The island itself: a capsule, as the Island section's icon. */
const IslandGlyph: Icon = ({ size = 14, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="8" width="18" height="8" rx="4" fill={color} />
  </svg>
);

export interface Section {
  id: string;
  title: string;
  blurb: string;
  Icon: Icon;
  /** Icon tile colours (gradient), like System Settings. */
  tile: [string, string];
  /** Rows, for search: [id, label, extra words]. */
  rows: [string, string, string?][];
  Page: React.FC;
}

// --- State ---------------------------------------------------------------------

export function useSettings(): [FloatSettings, (patch: Partial<FloatSettings>) => void] {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => subscribeToSettings(setSettings), []);
  const update = (patch: Partial<FloatSettings>) => saveSettings({ ...loadSettings(), ...patch });
  return [settings, update];
}

const link = (url: string) => () => openUrl(url).catch(() => {});

// --- Pages -----------------------------------------------------------------------

const GeneralPage: React.FC = () => {
  const [s, update] = useSettings();
  const [autostart, setAuto] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    getAutostart().then(setAuto);
    const un = subscribeToAutostart(setAuto);
    return () => {
      un.then((fn) => fn());
    };
  }, []);
  return (
    <>
      <Group>
        <Row id="autostart" label="Open at login" desc="Start FLOAT when you sign in to Windows">
          <Switch label="Open at login" on={autostart} onChange={(on) => setAutostart(on).then(setAuto)} />
        </Row>
        <Row id="fullscreen" label="Hide in full screen" desc="Get out of the way of full-screen games, videos and presentations">
          <Switch label="Hide in full screen" on={s.hideInFullscreen} onChange={(hideInFullscreen) => update({ hideInFullscreen })} />
        </Row>
        <Row id="downloads" label="Downloads and Nearby Share" desc="Show files as they finish downloading or arrive, with Open and Show in folder">
          <Switch label="Downloads and Nearby Share" on={s.downloadAlerts} onChange={(downloadAlerts) => update({ downloadAlerts })} />
        </Row>
      </Group>
      <Group foot="Puts every setting back to how FLOAT comes. Your tasks, notes and pinned snippets are kept.">
        <Row id="reset" label="Reset all settings">
          {confirmReset ? (
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" className="sw-btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sw-btn danger"
                onClick={() => {
                  saveSettings({ ...DEFAULT_FLOAT_SETTINGS });
                  setConfirmReset(false);
                }}
              >
                Reset
              </button>
            </span>
          ) : (
            <button type="button" className="sw-btn" onClick={() => setConfirmReset(true)}>
              Reset…
            </button>
          )}
        </Row>
      </Group>
    </>
  );
};

const IslandPage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group>
        <Row id="shape" label="Shape" desc="A pill just below the top edge, like the new MacBook Pro, or a notch joined to the edge">
          <Popup label="Shape" value={s.islandShape} options={[["pill", "Island"], ["notch", "Notch"]] as const} onChange={(islandShape) => update({ islandShape })} />
        </Row>
        <Row id="idle" label="When idle" desc="What the island becomes when nothing is happening">
          <Popup
            label="When idle"
            value={s.idleBehavior}
            options={[["alwaysPill", "Stay as the island"], ["alwaysOrb", "Shrink to an orb"], ["remember", "Remember last"]] as const}
            onChange={(idleBehavior) => update({ idleBehavior })}
          />
        </Row>
        <Row id="width" label="Activity width" desc="How wide the island grows for music, timers and alerts">
          <Slider label="Activity width" min={PILL_LENGTH_MIN} max={PILL_LENGTH_MAX} value={s.pillLength} onChange={(pillLength) => update({ pillLength })} left="Narrow" right="Wide" />
        </Row>
        {s.idleBehavior !== "alwaysPill" && (
          <Row id="orb" label="Orb size">
            <Slider label="Orb size" min={44} max={56} value={s.orbSize} onChange={(orbSize) => update({ orbSize })} left="S" right="L" />
          </Row>
        )}
      </Group>
      <Group title="Motion">
        <Row id="animation" label="Animation" desc="How lively the island's springs feel">
          <Segmented value={s.animationIntensity} options={[["subtle", "Subtle"], ["balanced", "Balanced"], ["expressive", "Expressive"]] as const} onChange={(animationIntensity) => update({ animationIntensity })} />
        </Row>
      </Group>
    </>
  );
};

const AppearancePage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group foot="Auto is black while docked at the top and liquid glass once you drag the island away. Glass needs Windows 11.">
        <Row id="style" label="Style">
          <Segmented value={s.visualStyle} options={[["auto", "Auto"], ["glass", "Glass"], ["black", "Black"]] as const} onChange={(visualStyle) => update({ visualStyle })} />
        </Row>
        <Row id="tint" label="Glass tint" disabled={s.visualStyle === "black"}>
          <Slider
            label="Glass tint"
            min={GLASS_TINT_MIN * 100}
            max={GLASS_TINT_MAX * 100}
            value={Math.round(s.transparency * 100)}
            onChange={(v) => update({ transparency: v / 100 })}
            left="Clear"
            right="Dark"
          />
        </Row>
      </Group>
      <Group title="Music">
        <Row id="waves" label="Music waves" desc="Glowing waves behind the player that move with the music">
          <Switch label="Music waves" on={s.musicWaves} onChange={(musicWaves) => update({ musicWaves })} />
        </Row>
      </Group>
    </>
  );
};

const MousePage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group>
        <Row id="hover" label="Open on hover" desc="Rest the pointer on the island to open it; it closes when you move away. Off: click or tap">
          <Switch label="Open on hover" on={s.openOnHover} onChange={(openOnHover) => update({ openOnHover })} />
        </Row>
        <Row id="delay" label="Hover delay" disabled={!s.openOnHover}>
          <Popup label="Hover delay" value={s.hoverDelay} options={[["short", "Quick"], ["normal", "Normal"], ["long", "Relaxed"]] as const} onChange={(hoverDelay) => update({ hoverDelay })} />
        </Row>
      </Group>
      <Group title="Scroll and click">
        <Row id="scroll" label="Scroll for volume">
          <Switch label="Scroll for volume" on={s.scrollVolume} onChange={(scrollVolume) => update({ scrollVolume })} />
        </Row>
        <Row id="skip" label="Swipe sideways to skip" desc="Scroll sideways (or Shift + scroll) for the next or previous track">
          <Switch label="Swipe sideways to skip" on={s.scrollSkip} onChange={(scrollSkip) => update({ scrollSkip })} />
        </Row>
        <Row id="middle" label="Middle-click to play or pause">
          <Switch label="Middle-click to play or pause" on={s.middleClickPlayPause} onChange={(middleClickPlayPause) => update({ middleClickPlayPause })} />
        </Row>
      </Group>
      <Group title="Touch" foot="Tap to open, flick down to open, flick up to close. Touch and hold, then drag, to move the island. Controls grow when you use a finger.">
        <></>
      </Group>
    </>
  );
};

// --- Keyboard: record your own shortcuts -----------------------------------------

const ACTIONS: [ShortcutAction, string, string][] = [
  ["open", "Open FLOAT", "Opens or closes the island from anywhere"],
  ["search", "Search", "Opens the island straight into search"],
  ["paste", "Paste from history", "Clipboard history and pinned snippets, pasted where you were typing"],
  ["text", "Copy Text from Anything", "Drag over any part of the screen to copy its text"],
  ["mic", "Mute microphone", "Mutes or unmutes your default microphone"],
];

/** "Ctrl+Alt+V" from a key event, or null while only modifiers are held. */
function accelerator(e: React.KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  const code = e.code;
  const key = code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code;
  // A global shortcut needs Ctrl, Alt or Win (Shift alone would block typing), unless it's an F-key.
  if (!(e.ctrlKey || e.altKey || e.metaKey) && !/^F\d+$/.test(key)) return "";
  return [...parts, key].join("+");
}

const Keys: React.FC<{ label: string | null }> = ({ label }) =>
  label ? (
    <>
      {label.split("+").map((k) => (
        <span key={k} className="kbd">
          {k}
        </span>
      ))}
    </>
  ) : (
    <span style={{ color: "var(--label-3)" }}>Off</span>
  );

const ShortcutRow: React.FC<{ action: ShortcutAction; title: string; desc: string; label: string | null; onLabel: (l: string | null) => void }> = ({
  action,
  title,
  desc,
  label,
  onLabel,
}) => {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLButtonElement>(null);

  const stop = () => {
    setRecording(false);
    pauseShortcuts(false);
  };
  const save = (accel: string | null) => {
    const s = loadSettings();
    const shortcuts = { ...s.shortcuts };
    if (accel === "default") delete shortcuts[action];
    else shortcuts[action] = accel;
    setShortcut(action, accel)
      .then((l) => {
        onLabel(l);
        setError("");
        saveSettings({ ...loadSettings(), shortcuts });
      })
      .catch((e) => setError(String(e)));
  };

  return (
    <Row id={`key-${action}`} label={title} desc={error ? <span style={{ color: "#ff3b30" }}>{error}</span> : desc}>
      <button
        ref={ref}
        type="button"
        className={`sw-keys ${recording ? "recording" : ""}`}
        onClick={() => {
          setError("");
          setRecording(true);
          pauseShortcuts(true);
        }}
        onBlur={() => recording && stop()}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === "Escape") return stop();
          if (e.key === "Backspace" || e.key === "Delete") {
            stop();
            return save(null);
          }
          const accel = accelerator(e);
          if (accel === null) return;
          if (accel === "") {
            setError("Add Ctrl, Alt or Win, so the shortcut doesn't block typing");
            return;
          }
          stop();
          save(accel);
        }}
        aria-label={`${title} shortcut`}
      >
        {recording ? "Type a shortcut…" : <Keys label={label} />}
      </button>
      <button type="button" className="sw-nav-btn" title="Use FLOAT's default" aria-label="Reset to default" onClick={() => save("default")}>
        <RotateCcw size={14} strokeWidth={2.2} />
      </button>
    </Row>
  );
};

const KeyboardPage: React.FC = () => {
  const [labels, setLabels] = useState<Partial<Record<ShortcutAction, string | null>>>({});
  useEffect(() => {
    getShortcuts().then((list) => setLabels(Object.fromEntries(list.map((s) => [s.action, s.label]))));
  }, []);
  return (
    <Group foot="Click a shortcut, then press the new keys. Backspace turns it off, Esc cancels, and the arrow puts back FLOAT's default. If another app already uses a combination, FLOAT says so and keeps the old one.">
      {ACTIONS.map(([action, title, desc]) => (
        <ShortcutRow key={action} action={action} title={title} desc={desc} label={labels[action] ?? null} onLabel={(l) => setLabels((x) => ({ ...x, [action]: l }))} />
      ))}
    </Group>
  );
};

const FocusPage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group foot="Calls always come through.">
        <Row id="focus-notifs" label="Notifications while focusing" desc="Hold: no banners, and a summary when the session ends. Quiet: only the unread dot">
          <Popup label="Notifications while focusing" value={s.focusNotifications} options={[["hold", "Hold and summarise"], ["quiet", "Quiet"]] as const} onChange={(focusNotifications) => update({ focusNotifications })} />
        </Row>
      </Group>
      <Group title="Meetings">
        <Row id="meetings" label="Meeting countdown" desc="Your next meeting in the island 10 minutes before, with Join for Teams, Zoom and Meet. A meeting starting pauses your focus session">
          <Switch label="Meeting countdown" on={s.meetingAlerts} onChange={(meetingAlerts) => update({ meetingAlerts })} />
        </Row>
      </Group>
    </>
  );
};

const NotificationsPage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group>
        <Row id="notif-presence" label="Show notifications" desc="Banners and the unread dot in the island">
          <Switch label="Show notifications" on={s.notificationPresence} onChange={(notificationPresence) => update({ notificationPresence })} />
        </Row>
        <Row id="notif-preview" label="Preview banners" disabled={!s.notificationPresence}>
          <Switch label="Preview banners" on={s.notificationPreview} disabled={!s.notificationPresence} onChange={(notificationPreview) => update({ notificationPreview })} />
        </Row>
        <Row id="notif-content" label="Show message text" desc="Off: only the app's name" disabled={!s.notificationPresence || !s.notificationPreview}>
          <Switch label="Show message text" on={s.notificationContent} disabled={!s.notificationPresence || !s.notificationPreview} onChange={(notificationContent) => update({ notificationContent })} />
        </Row>
      </Group>
      <Group>
        <Row id="notif-windows" label="Windows notification settings" desc="Do not disturb, and which apps may notify">
          <button type="button" className="sw-btn" onClick={() => openSettingsPage("notifications")}>
            Open…
          </button>
        </Row>
      </Group>
    </>
  );
};

const ClipboardPage: React.FC = () => {
  const [s, update] = useSettings();
  const snippets = useSnippets();
  const [draft, setDraft] = useState("");
  const [cleared, setCleared] = useState(false);
  return (
    <>
      <Group foot="History stays in memory only, never on disk, and is gone when FLOAT quits. Things apps mark as private, like passwords, are never kept.">
        <Row id="clip-history" label="Clipboard history">
          <Switch label="Clipboard history" on={s.clipboardHistory} onChange={(clipboardHistory) => update({ clipboardHistory })} />
        </Row>
        <Row id="clip-clear" label="Clear history">
          <button
            type="button"
            className="sw-btn"
            onClick={() => {
              clearClipboardHistory();
              setCleared(true);
            }}
          >
            {cleared ? "Cleared" : "Clear"}
          </button>
        </Row>
      </Group>
      <Group title="Pinned snippets" foot="Pinned text stays at the top of the paste picker, even after a restart. Pin from the picker with Ctrl+P, or add one here.">
        {snippets.map((snip) => (
          <Row key={snip.id} label={<span style={{ whiteSpace: "pre-wrap" }}>{snip.text.length > 140 ? `${snip.text.slice(0, 140)}…` : snip.text}</span>}>
            <button type="button" className="sw-nav-btn" aria-label="Unpin" title="Unpin" onClick={() => snippetList.unpin(snip.id)}>
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          </Row>
        ))}
        <Row id="snippet-add" label={<input className="sw-field" style={{ width: "100%" }} value={draft} placeholder="New snippet, e.g. your email address" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && draft.trim() && (snippetList.pin(draft), setDraft(""))} aria-label="New snippet" />}>
          <button
            type="button"
            className="sw-btn"
            disabled={!draft.trim()}
            onClick={() => {
              snippetList.pin(draft);
              setDraft("");
            }}
          >
            Add
          </button>
        </Row>
      </Group>
    </>
  );
};

/** Whether the calendar link works, or why not. */
const CalendarStatus: React.FC<{ url: string }> = ({ url }) => {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setStatus(null);
    if (!url.trim()) return;
    let cancelled = false;
    setStatus({ ok: true, text: "Checking the link…" });
    getCalendarEvents(url)
      .then((events) => {
        if (cancelled) return;
        const next = events.find(isAppointment);
        setStatus({
          ok: true,
          text: next
            ? `Connected · next: ${next.title}, ${new Date(next.start).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
            : "Connected · no upcoming meetings in the next 30 days",
        });
      })
      .catch((e) => !cancelled && setStatus({ ok: false, text: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return status ? <span className={`sw-status ${status.ok ? "ok" : "error"}`}>{status.text}</span> : null;
};

const CalendarPage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group title="Calendar" foot="In Google Calendar: Settings › your calendar › Integrate calendar › Secret address in iCal format. Outlook and iCloud have one too. FLOAT downloads it to show your next event.">
        <Row id="calendar" label="Calendar link" desc={<CalendarStatus url={s.calendarUrl} />}>
          <Field label="Calendar link" value={s.calendarUrl} placeholder="https://…/basic.ics" onCommit={(calendarUrl) => update({ calendarUrl })} />
        </Row>
      </Group>
      <Group title="Weather" foot="Sends only your city name to open-meteo.com.">
        <Row id="weather" label="Show weather on Home">
          <Switch label="Show weather" on={s.weatherEnabled} onChange={(weatherEnabled) => update({ weatherEnabled })} />
        </Row>
        <Row id="city" label="City" disabled={!s.weatherEnabled}>
          <Field label="City" width={200} value={s.weatherCity} placeholder="e.g. Bengaluru" onCommit={(weatherCity) => update({ weatherCity })} />
        </Row>
        <Row id="units" label="Units" disabled={!s.weatherEnabled}>
          <Segmented value={s.weatherFahrenheit ? "f" : "c"} options={[["c", "°C"], ["f", "°F"]] as const} onChange={(v) => update({ weatherFahrenheit: v === "f" })} />
        </Row>
      </Group>
    </>
  );
};

const PrivacyPage: React.FC = () => {
  const [s, update] = useSettings();
  return (
    <>
      <Group foot="Everything else (search, clipboard, tasks, notes, focus, Copy Text) works only on your PC. FLOAT has no account and no analytics.">
        <Row id="p-weather" label="Weather" desc="Your city name, to open-meteo.com">
          <Switch label="Weather" on={s.weatherEnabled} onChange={(weatherEnabled) => update({ weatherEnabled })} />
        </Row>
        <Row id="p-lyrics" label="Synced lyrics" desc="The song title and artist, to lrclib.net">
          <Switch label="Synced lyrics" on={s.syncedLyrics} onChange={(syncedLyrics) => update({ syncedLyrics })} />
        </Row>
        <Row id="p-updates" label="Check for updates" desc="Asks GitHub for the latest version number, once a day">
          <Switch label="Check for updates" on={s.autoUpdateCheck} onChange={(autoUpdateCheck) => update({ autoUpdateCheck })} />
        </Row>
        <Row id="p-calendar" label="Calendar" desc={s.calendarUrl ? "Downloads your calendar from the link you added" : "Off until you add a calendar link"} />
      </Group>
    </>
  );
};

// Opened from the tray's "Check for Updates…": check on arrival.
let pendingCheck = false;
export const requestUpdateCheck = () => (pendingCheck = true);

const UpdatesPage: React.FC = () => {
  const [s, update] = useSettings();
  const [version, setVersion] = useState("");
  const [state, setState] = useState<{ step: "idle" | "checking" | "checked" | "downloading" | "opened" | "error"; info?: UpdateInfo; text?: string; percent?: number }>({ step: "idle" });
  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersion).catch(() => {});
    const un = subscribeToUpdateProgress(({ received, total }) => setState((x) => (x.step === "downloading" ? { ...x, percent: Math.round((received / Math.max(1, total)) * 100) } : x)));
    if (pendingCheck) {
      pendingCheck = false;
      check();
    }
    return () => {
      un.then((fn) => fn()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const check = () => {
    setState({ step: "checking" });
    checkForUpdate()
      .then((info) => setState({ step: "checked", info }))
      .catch((e) => setState({ step: "error", text: String(e) }));
  };
  const install = (info: UpdateInfo) => {
    setState({ step: "downloading", info, percent: 0 });
    installUpdate()
      .then(() => setState({ step: "opened", info }))
      .catch((e) => setState({ step: "error", info, text: String(e) }));
  };
  const status =
    state.step === "checking"
      ? "Checking…"
      : state.step === "checked"
      ? state.info!.available
        ? `FLOAT ${state.info!.latest} is available`
        : "FLOAT is up to date"
      : state.step === "downloading"
      ? `Downloading… ${state.percent ?? 0}%`
      : state.step === "opened"
      ? "The installer is open"
      : state.step === "error"
      ? state.text
      : `You have FLOAT ${version}`;
  return (
    <>
      <Group>
        <Row id="u-now" label={status} desc={state.step === "checked" && state.info?.available ? <a onClick={link(state.info.page)} style={{ color: "var(--accent)", cursor: "pointer" }}>Release notes</a> : `Version ${version}`}>
          {state.step === "checked" && state.info?.available ? (
            <button type="button" className="sw-btn primary" onClick={() => install(state.info!)}>
              Update now
            </button>
          ) : (
            <button type="button" className="sw-btn" disabled={state.step === "checking" || state.step === "downloading"} onClick={check}>
              Check now
            </button>
          )}
        </Row>
      </Group>
      <Group foot="Once a day FLOAT asks GitHub for the latest version number and offers it in the island. Nothing about you is sent.">
        <Row id="u-auto" label="Check automatically">
          <Switch label="Check automatically" on={s.autoUpdateCheck} onChange={(autoUpdateCheck) => update({ autoUpdateCheck })} />
        </Row>
      </Group>
    </>
  );
};

const AboutPage: React.FC = () => {
  const [version, setVersion] = useState("");
  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()).then(setVersion).catch(() => {});
  }, []);
  return (
    <>
      <div style={{ textAlign: "center", padding: "18px 0 8px" }}>
        <div style={{ width: 120, height: 34, margin: "0 auto", borderRadius: 17, background: "#000", boxShadow: "0 0 0 0.5px rgba(255,255,255,.2), 0 10px 30px rgba(0,0,0,.25)" }} />
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", marginTop: 16 }}>FLOAT</div>
        <div style={{ color: "var(--label-2)", marginTop: 4 }}>The Dynamic Island for Windows · Version {version}</div>
      </div>
      <Group>
        <Row id="a-whatsnew" label="What's new">
          <button type="button" className="sw-btn" onClick={link(`https://github.com/Sahaj1207/FLOAT/releases/tag/v${version}`)}>
            Release notes…
          </button>
        </Row>
        <Row id="a-source" label="Source code" desc="Free and open source on GitHub">
          <button type="button" className="sw-btn" onClick={link("https://github.com/Sahaj1207/FLOAT")}>
            GitHub…
          </button>
        </Row>
        <Row id="a-feedback" label="Feedback and bugs">
          <button type="button" className="sw-btn" onClick={link("https://github.com/Sahaj1207/FLOAT/issues")}>
            Report…
          </button>
        </Row>
      </Group>
      <div className="sw-group-foot" style={{ textAlign: "center", marginTop: 16 }}>
        Made by Sahaj Alatage, with Claude.
      </div>
    </>
  );
};

// --- Registry ----------------------------------------------------------------------

export const SECTIONS: Section[][] = [
  [
    { id: "general", title: "General", blurb: "Startup, full screen and downloads.", Icon: Settings2, tile: ["#9a9aa1", "#6e6e75"], Page: GeneralPage, rows: [["autostart", "Open at login", "startup boot launch"], ["fullscreen", "Hide in full screen", "games"], ["downloads", "Downloads and Nearby Share"], ["reset", "Reset all settings", "defaults"]] },
    { id: "island", title: "Island", blurb: "Its shape, size and motion.", Icon: IslandGlyph, tile: ["#3a3a3c", "#000000"], Page: IslandPage, rows: [["shape", "Shape", "notch pill"], ["idle", "When idle", "orb"], ["width", "Activity width", "size"], ["orb", "Orb size"], ["animation", "Animation", "spring motion"]] },
    { id: "appearance", title: "Appearance", blurb: "Black, glass and music waves.", Icon: Palette, tile: ["#5e9bff", "#2a5cff"], Page: AppearancePage, rows: [["style", "Style", "glass black auto"], ["tint", "Glass tint", "transparency"], ["waves", "Music waves", "visualizer glow"]] },
  ],
  [
    { id: "mouse", title: "Mouse & Touch", blurb: "Hover, scroll, click and touch.", Icon: MousePointer2, tile: ["#4fb3ff", "#0a84ff"], Page: MousePage, rows: [["hover", "Open on hover"], ["delay", "Hover delay"], ["scroll", "Scroll for volume"], ["skip", "Swipe sideways to skip", "track"], ["middle", "Middle-click to play or pause"]] },
    { id: "keyboard", title: "Keyboard", blurb: "Shortcuts that work from anywhere.", Icon: Keyboard, tile: ["#a3a3aa", "#76767d"], Page: KeyboardPage, rows: [["key-open", "Open FLOAT shortcut", "hotkey"], ["key-search", "Search shortcut", "hotkey"], ["key-paste", "Paste shortcut", "hotkey clipboard"], ["key-text", "Copy Text shortcut", "hotkey ocr"], ["key-mic", "Mute microphone shortcut", "hotkey mic"]] },
  ],
  [
    { id: "focus", title: "Focus", blurb: "Focus sessions and meetings.", Icon: Target, tile: ["#a78bfa", "#6d48e8"], Page: FocusPage, rows: [["focus-notifs", "Notifications while focusing", "hold quiet"], ["meetings", "Meeting countdown", "calendar join"]] },
    { id: "notifications", title: "Notifications", blurb: "Banners and the unread dot.", Icon: Bell, tile: ["#ff6961", "#ff3b30"], Page: NotificationsPage, rows: [["notif-presence", "Show notifications"], ["notif-preview", "Preview banners"], ["notif-content", "Show message text", "privacy"], ["notif-windows", "Windows notification settings", "do not disturb"]] },
    { id: "clipboard", title: "Clipboard", blurb: "History and pinned snippets.", Icon: ClipboardList, tile: ["#ffb340", "#ff9500"], Page: ClipboardPage, rows: [["clip-history", "Clipboard history"], ["clip-clear", "Clear history"], ["snippet-add", "Pinned snippets", "pin paste"]] },
    { id: "calendar", title: "Calendar & Weather", blurb: "Your next meeting and the weather on Home.", Icon: CalendarDays, tile: ["#ff6961", "#e0352b"], Page: CalendarPage, rows: [["calendar", "Calendar link", "ics google outlook"], ["weather", "Show weather"], ["city", "City"], ["units", "Units", "celsius fahrenheit"]] },
  ],
  [
    { id: "privacy", title: "Privacy", blurb: "What stays on your PC, and what doesn't.", Icon: Hand, tile: ["#5ea9ff", "#1f6fff"], Page: PrivacyPage, rows: [["p-weather", "Weather privacy"], ["p-lyrics", "Synced lyrics"], ["p-updates", "Update check"], ["p-calendar", "Calendar privacy"]] },
    { id: "updates", title: "Updates", blurb: "New versions of FLOAT.", Icon: RefreshCw, tile: ["#8e8e93", "#5f5f66"], Page: UpdatesPage, rows: [["u-now", "Check for updates", "version"], ["u-auto", "Check automatically"]] },
    { id: "about", title: "About", blurb: "Version, source and feedback.", Icon: Info, tile: ["#5ea9ff", "#1f6fff"], Page: AboutPage, rows: [["a-whatsnew", "What's new", "release notes"], ["a-source", "Source code", "github"], ["a-feedback", "Feedback", "bug report"]] },
  ],
];

export const ALL_SECTIONS = SECTIONS.flat();
