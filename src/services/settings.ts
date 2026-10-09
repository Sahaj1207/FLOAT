import { setClipboardHistoryEnabled, setHideInFullscreen } from "../platform";

export type AnimationIntensity = "subtle" | "balanced" | "expressive";
export type IdleBehavior = "alwaysOrb" | "remember" | "alwaysPill";
export type RestingMode = "orb" | "compact";
export type VisualStyle = "notch" | "default" | "minimal" | "softGlass";

export interface FloatSettings {
  transparency: number; // 0.60 to 1.00, default 0.85
  pillLength: number;   // activity width, 220 to 340, default 300
  orbSize: number;      // 44 to 56, default 48
  animationIntensity: AnimationIntensity; // "subtle" | "balanced" | "expressive", default "balanced"
  notificationPresence: boolean; // default true
  notificationPreview: boolean;  // default true
  notificationContent: boolean;  // default true
  idleBehavior: IdleBehavior;    // "alwaysOrb" | "remember" | "alwaysPill", default "remember"
  rememberedRestingMode: RestingMode; // "orb" | "compact", default "compact"
  visualStyle: VisualStyle;      // "notch" (solid black) | glass styles, default "notch"
  hideInFullscreen: boolean;     // hide the island while a fullscreen app is focused, default true
  clipboardHistory: boolean;     // keep an in-memory clipboard history, default true
  syncedLyrics: boolean;         // fetch lyrics from LRCLIB (network, opt-in), default false
}

export const PILL_LENGTH_MIN = 220;
export const PILL_LENGTH_MAX = 340;

export const DEFAULT_FLOAT_SETTINGS: FloatSettings = {
  transparency: 1.0,
  pillLength: 300,
  orbSize: 48,
  animationIntensity: "balanced",
  notificationPresence: true,
  notificationPreview: true,
  notificationContent: true,
  idleBehavior: "alwaysPill",
  rememberedRestingMode: "compact",
  visualStyle: "notch",
  hideInFullscreen: true,
  clipboardHistory: true,
  syncedLyrics: false,
};

const SETTINGS_STORAGE_KEY = "float_settings_v1";
// Bumped when defaults change in a way saved settings should adopt once.
// v2: MacBook-notch design (solid notch style, island idle, wider activities).
const SETTINGS_VERSION = 2;

type SettingsListener = (settings: FloatSettings) => void;
const listeners = new Set<SettingsListener>();

export function subscribeToSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadSettings(): FloatSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_FLOAT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed.settingsVersion !== SETTINGS_VERSION) {
      Object.assign(parsed, {
        settingsVersion: SETTINGS_VERSION,
        visualStyle: DEFAULT_FLOAT_SETTINGS.visualStyle,
        transparency: DEFAULT_FLOAT_SETTINGS.transparency,
        idleBehavior: DEFAULT_FLOAT_SETTINGS.idleBehavior,
        pillLength: DEFAULT_FLOAT_SETTINGS.pillLength,
      });
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
    }
    const transparency =
      typeof parsed.transparency === "number" && !isNaN(parsed.transparency)
        ? Math.min(1.0, Math.max(0.6, parsed.transparency))
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

    const validVisualStyles: VisualStyle[] = ["notch", "default", "minimal", "softGlass"];
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

    return {
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
  } catch (e) {
    console.error("Failed to save FLOAT settings:", e);
  }
}

/** Push the settings the native side acts on (window visibility) to Rust. */
export function applySettingsToNative(settings: FloatSettings): void {
  setHideInFullscreen(settings.hideInFullscreen);
  setClipboardHistoryEnabled(settings.clipboardHistory);
}

export function applySettingsToDOM(settings: FloatSettings): void {
  const clampedTransparency = Math.min(1.0, Math.max(0.6, settings.transparency));
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

  document.documentElement.style.setProperty("--float-glass-opacity", clampedTransparency.toString());
  document.documentElement.style.setProperty("--float-pill-width", `${clampedPillLength}px`);
  document.documentElement.style.setProperty("--float-orb-size", `${clampedOrbSize}px`);
  document.documentElement.setAttribute("data-intensity", intensity);
  document.documentElement.setAttribute("data-style", visualStyle);
}
