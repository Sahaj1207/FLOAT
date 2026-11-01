import { setClipboardHistoryEnabled, setDownloadAlerts, setHideInFullscreen, setShortcut, ShortcutAction } from "../platform";
import { emit, listen } from "@tauri-apps/api/event";

export type AnimationIntensity = "subtle" | "balanced" | "expressive";
export type IdleBehavior = "alwaysOrb" | "remember" | "alwaysPill";
export type RestingMode = "orb" | "compact";
// auto: black notch when docked, liquid glass when floating.
export type VisualStyle = "auto" | "glass" | "black";
// pill: a detached island just below the top edge (iPhone, new MacBook Pro).
// notch: fused to the screen edge like the older MacBook notch.
export type IslandShape = "pill" | "notch";
export type HoverDelay = "short" | "normal" | "long";
// During a focus session: hold banners and summarise at the end, or just
// skip banners (the unread dot still shows).
export type FocusNotifications = "hold" | "quiet";

export interface FloatSettings {
  transparency: number; // glass tint: how dark the glass is, 0.10 to 0.90, default 0.45
  pillLength: number;   // activity width, 220 to 340, default 300
  orbSize: number;      // 44 to 56, default 48
  animationIntensity: AnimationIntensity; // "subtle" | "balanced" | "expressive", default "balanced"
  notificationPresence: boolean; // default true
  notificationPreview: boolean;  // default true
  notificationContent: boolean;  // default true
  idleBehavior: IdleBehavior;    // "alwaysOrb" | "remember" | "alwaysPill", default "remember"
  rememberedRestingMode: RestingMode; // "orb" | "compact", default "compact"
  visualStyle: VisualStyle;      // "auto" | "glass" | "black", default "auto"
  hideInFullscreen: boolean;     // hide the island while a fullscreen app is focused, default true
  clipboardHistory: boolean;     // keep an in-memory clipboard history, default true
  syncedLyrics: boolean;         // fetch lyrics from LRCLIB (network, opt-in), default false
  openOnHover: boolean;          // hovering the notch opens the panel, default true
  weatherEnabled: boolean;       // show weather from Open-Meteo (network, opt-in), default false
  weatherCity: string;           // city name looked up for weather
  weatherFahrenheit: boolean;    // default false (Celsius)
  calendarUrl: string;           // private ICS link for the calendar widget ("" = off)
  islandShape: IslandShape;      // "pill" | "notch", default "pill"
  hoverDelay: HoverDelay;        // how long to rest on the island before it opens, default "normal"
  scrollVolume: boolean;         // scrolling on the island changes the volume, default true
  scrollSkip: boolean;           // sideways scrolling skips tracks, default true
  middleClickPlayPause: boolean; // middle-click on the island plays / pauses, default true
  downloadAlerts: boolean;       // show finished downloads and Nearby Share files, default true
  musicWaves: boolean;           // glowing waves behind the player that move with the music, default true
  focusNotifications: FocusNotifications; // "hold" | "quiet", default "hold"
  meetingAlerts: boolean;        // show the next meeting in the island 10 min before, default true
  autoUpdateCheck: boolean;      // ask GitHub once a day for a newer version and offer it in the island, default true
  // Keyboard shortcuts the user changed: an accelerator, or null for off.
  // Missing means FLOAT's default.
  shortcuts: Partial<Record<ShortcutAction, string | null>>;
}

export const PILL_LENGTH_MIN = 220;
export const PILL_LENGTH_MAX = 340;

export const DEFAULT_FLOAT_SETTINGS: FloatSettings = {
  transparency: 0.45,
  pillLength: 300,
  orbSize: 48,
  animationIntensity: "balanced",
  notificationPresence: true,
  notificationPreview: true,
  notificationContent: true,
  idleBehavior: "alwaysPill",
  rememberedRestingMode: "compact",
  visualStyle: "auto",
  hideInFullscreen: true,
  clipboardHistory: true,
  syncedLyrics: false,
  openOnHover: true,
  weatherEnabled: false,
  weatherCity: "",
  weatherFahrenheit: false,
  calendarUrl: "",
  islandShape: "pill",
  hoverDelay: "normal",
  scrollVolume: true,
  scrollSkip: true,
  middleClickPlayPause: true,
  downloadAlerts: true,
  musicWaves: true,
  focusNotifications: "hold",
  meetingAlerts: true,
  autoUpdateCheck: true,
  shortcuts: {},
};

const SETTINGS_STORAGE_KEY = "float_settings_v1";
// Bumped when defaults change in a way saved settings should adopt once.
// v2: MacBook-notch design (solid notch style, island idle, wider activities).
// v3: real glass; styles become auto / glass / black, transparency = glass tint.
// v4: the island becomes a detached pill by default, like the new MacBook Pro.
const SETTINGS_VERSION = 4;

export const GLASS_TINT_MIN = 0.1;
export const GLASS_TINT_MAX = 0.9;

type SettingsListener = (settings: FloatSettings) => void;
const listeners = new Set<SettingsListener>();

export function subscribeToSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Settings saved in another window (Settings <-> island) apply here too.
const WINDOW_ID = Math.random().toString(36).slice(2);
listen<string>("float-settings-changed", (event) => {
  if (event.payload === WINDOW_ID) return;
  const next = loadSettings();
  applySettingsToDOM(next);
  listeners.forEach((l) => l(next));
}).catch(() => {});

/** Apply saved shortcut changes at startup (the island window only). */
export function applySavedShortcuts(settings: FloatSettings): void {
  for (const [action, accelerator] of Object.entries(settings.shortcuts)) {
    setShortcut(action as ShortcutAction, accelerator ?? null).catch(() => {});
  }
}

export function loadSettings(): FloatSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_FLOAT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed.settingsVersion !== SETTINGS_VERSION) {
      const version = parsed.settingsVersion ?? 1;
      const fromBeforeNotch = version < 2;
      if (version < 3) {
        Object.assign(parsed, {
          visualStyle: DEFAULT_FLOAT_SETTINGS.visualStyle,
          transparency: DEFAULT_FLOAT_SETTINGS.transparency,
        });
      }
      Object.assign(parsed, { settingsVersion: SETTINGS_VERSION, islandShape: DEFAULT_FLOAT_SETTINGS.islandShape });
      if (fromBeforeNotch) {
        Object.assign(parsed, {
          idleBehavior: DEFAULT_FLOAT_SETTINGS.idleBehavior,
          pillLength: DEFAULT_FLOAT_SETTINGS.pillLength,
        });
      }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
    }
    const transparency =
      typeof parsed.transparency === "number" && !isNaN(parsed.transparency)
        ? Math.min(GLASS_TINT_MAX, Math.max(GLASS_TINT_MIN, parsed.transparency))
        : DEFAULT_FLOAT_SETTINGS.transparency;
    const pillLength =
      typeof parsed.pillLength === "number" && !isNaN(parsed.pillLength)
        ? Math.min(PILL_LENGTH_MAX, Math.max(PILL_LENGTH_MIN, parsed.pillLength))
        : DEFAULT_FLOAT_SETTINGS.pillLength;
    const orbSize =
      typeof parsed.orbSize === "number" && !isNaN(parsed.orbSize)
        ? Math.min(56, Math.max(44, parsed.orbSize))
        : DEFAULT_FLOAT_SETTINGS.orbSize;
    const validIntensities: AnimationIntensity[] = ["subtle", "balanced", "expressive"];
    const animationIntensity = validIntensities.includes(parsed.animationIntensity)
      ? (parsed.animationIntensity as AnimationIntensity)
      : DEFAULT_FLOAT_SETTINGS.animationIntensity;
    const notificationPresence =
      typeof parsed.notificationPresence === "boolean"
        ? parsed.notificationPresence
        : DEFAULT_FLOAT_SETTINGS.notificationPresence;
    const notificationPreview =
      typeof parsed.notificationPreview === "boolean"
        ? parsed.notificationPreview
        : DEFAULT_FLOAT_SETTINGS.notificationPreview;
    const notificationContent =
      typeof parsed.notificationContent === "boolean"
        ? parsed.notificationContent
        : DEFAULT_FLOAT_SETTINGS.notificationContent;

    const validIdleBehaviors: IdleBehavior[] = ["alwaysOrb", "remember", "alwaysPill"];
    const idleBehavior = validIdleBehaviors.includes(parsed.idleBehavior)
      ? (parsed.idleBehavior as IdleBehavior)
      : DEFAULT_FLOAT_SETTINGS.idleBehavior;

    const validRestingModes: RestingMode[] = ["orb", "compact"];
    const rememberedRestingMode = validRestingModes.includes(parsed.rememberedRestingMode)
      ? (parsed.rememberedRestingMode as RestingMode)
      : DEFAULT_FLOAT_SETTINGS.rememberedRestingMode;

    const validVisualStyles: VisualStyle[] = ["auto", "glass", "black"];
    const visualStyle = validVisualStyles.includes(parsed.visualStyle)
      ? (parsed.visualStyle as VisualStyle)
      : DEFAULT_FLOAT_SETTINGS.visualStyle;

    const hideInFullscreen =
      typeof parsed.hideInFullscreen === "boolean"
        ? parsed.hideInFullscreen
        : DEFAULT_FLOAT_SETTINGS.hideInFullscreen;

    const clipboardHistory =
      typeof parsed.clipboardHistory === "boolean"
        ? parsed.clipboardHistory
        : DEFAULT_FLOAT_SETTINGS.clipboardHistory;

    const syncedLyrics =
      typeof parsed.syncedLyrics === "boolean" ? parsed.syncedLyrics : DEFAULT_FLOAT_SETTINGS.syncedLyrics;

    const openOnHover =
      typeof parsed.openOnHover === "boolean" ? parsed.openOnHover : DEFAULT_FLOAT_SETTINGS.openOnHover;

    const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
    const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

    const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
      options.includes(value as T) ? (value as T) : fallback;

    return {
      islandShape: pick(parsed.islandShape, ["pill", "notch"] as const, DEFAULT_FLOAT_SETTINGS.islandShape),
      hoverDelay: pick(parsed.hoverDelay, ["short", "normal", "long"] as const, DEFAULT_FLOAT_SETTINGS.hoverDelay),
      scrollVolume: bool(parsed.scrollVolume, DEFAULT_FLOAT_SETTINGS.scrollVolume),
      scrollSkip: bool(parsed.scrollSkip, DEFAULT_FLOAT_SETTINGS.scrollSkip),
      middleClickPlayPause: bool(parsed.middleClickPlayPause, DEFAULT_FLOAT_SETTINGS.middleClickPlayPause),
      downloadAlerts: bool(parsed.downloadAlerts, DEFAULT_FLOAT_SETTINGS.downloadAlerts),
      musicWaves: bool(parsed.musicWaves, DEFAULT_FLOAT_SETTINGS.musicWaves),
      focusNotifications: pick(parsed.focusNotifications, ["hold", "quiet"] as const, DEFAULT_FLOAT_SETTINGS.focusNotifications),
      meetingAlerts: bool(parsed.meetingAlerts, DEFAULT_FLOAT_SETTINGS.meetingAlerts),
      autoUpdateCheck: bool(parsed.autoUpdateCheck, DEFAULT_FLOAT_SETTINGS.autoUpdateCheck),
      shortcuts: parsed.shortcuts && typeof parsed.shortcuts === "object" ? parsed.shortcuts : {},
      weatherEnabled: bool(parsed.weatherEnabled, DEFAULT_FLOAT_SETTINGS.weatherEnabled),
      weatherCity: text(parsed.weatherCity, 80),
      weatherFahrenheit: bool(parsed.weatherFahrenheit, DEFAULT_FLOAT_SETTINGS.weatherFahrenheit),
      calendarUrl: text(parsed.calendarUrl, 2000),
      transparency,
      pillLength,
      orbSize,
      animationIntensity,
      notificationPresence,
      notificationPreview,
      notificationContent,
      idleBehavior,
      rememberedRestingMode,
      visualStyle,
      hideInFullscreen,
      clipboardHistory,
      syncedLyrics,
      openOnHover,
    };
  } catch {
    return DEFAULT_FLOAT_SETTINGS;
  }
}

export function saveSettings(settings: FloatSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...settings, settingsVersion: SETTINGS_VERSION }));
    applySettingsToDOM(settings);
    applySettingsToNative(settings);
    listeners.forEach((l) => l(settings));
    // The island and the Settings window are separate windows: tell the other.
    emit("float-settings-changed", WINDOW_ID).catch(() => {});
  } catch (e) {
    console.error("Failed to save FLOAT settings:", e);
  }
}

/** Push the settings the native side acts on (window visibility) to Rust. */
export function applySettingsToNative(settings: FloatSettings): void {
  setHideInFullscreen(settings.hideInFullscreen);
  setClipboardHistoryEnabled(settings.clipboardHistory);
  setDownloadAlerts(settings.downloadAlerts);
}

export function applySettingsToDOM(settings: FloatSettings): void {
  const clampedTransparency = Math.min(GLASS_TINT_MAX, Math.max(GLASS_TINT_MIN, settings.transparency));
  const clampedPillLength = Math.min(
    PILL_LENGTH_MAX,
    Math.max(PILL_LENGTH_MIN, settings.pillLength ?? DEFAULT_FLOAT_SETTINGS.pillLength)
  );
  const clampedOrbSize = Math.min(
    56,
    Math.max(44, settings.orbSize ?? DEFAULT_FLOAT_SETTINGS.orbSize)
  );
  const intensity = settings.animationIntensity ?? DEFAULT_FLOAT_SETTINGS.animationIntensity;
  const visualStyle = settings.visualStyle ?? DEFAULT_FLOAT_SETTINGS.visualStyle;

  document.documentElement.style.setProperty("--float-glass-tint", clampedTransparency.toString());
  document.documentElement.style.setProperty("--float-pill-width", `${clampedPillLength}px`);
  document.documentElement.style.setProperty("--float-orb-size", `${clampedOrbSize}px`);
  document.documentElement.setAttribute("data-intensity", intensity);
  document.documentElement.setAttribute("data-style", visualStyle);
}
