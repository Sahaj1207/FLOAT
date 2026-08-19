export type AnimationIntensity = "subtle" | "balanced" | "expressive";
export type IdleBehavior = "alwaysOrb" | "remember" | "alwaysPill";
export type RestingMode = "orb" | "compact";
export type VisualStyle = "default" | "minimal" | "softGlass";

export interface FloatSettings {
  transparency: number; // 0.60 to 1.00, default 0.85
  pillLength: number;   // 200 to 280, default 240
  orbSize: number;      // 44 to 56, default 48
  animationIntensity: AnimationIntensity; // "subtle" | "balanced" | "expressive", default "balanced"
  notificationPresence: boolean; // default true
  notificationPreview: boolean;  // default true
  notificationContent: boolean;  // default true
  idleBehavior: IdleBehavior;    // "alwaysOrb" | "remember" | "alwaysPill", default "remember"
  rememberedRestingMode: RestingMode; // "orb" | "compact", default "compact"
  visualStyle: VisualStyle;      // "default" | "minimal" | "softGlass", default "default"
}

export const DEFAULT_FLOAT_SETTINGS: FloatSettings = {
  transparency: 0.85,
  pillLength: 240,
  orbSize: 48,
  animationIntensity: "balanced",
  notificationPresence: true,
  notificationPreview: true,
  notificationContent: true,
  idleBehavior: "remember",
  rememberedRestingMode: "compact",
  visualStyle: "default",
};

const SETTINGS_STORAGE_KEY = "float_settings_v1";

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
    const transparency =
      typeof parsed.transparency === "number" && !isNaN(parsed.transparency)
        ? Math.min(1.0, Math.max(0.6, parsed.transparency))
        : DEFAULT_FLOAT_SETTINGS.transparency;
    const pillLength =
      typeof parsed.pillLength === "number" && !isNaN(parsed.pillLength)
        ? Math.min(280, Math.max(200, parsed.pillLength))
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

    const validVisualStyles: VisualStyle[] = ["default", "minimal", "softGlass"];
    const visualStyle = validVisualStyles.includes(parsed.visualStyle)
      ? (parsed.visualStyle as VisualStyle)
      : DEFAULT_FLOAT_SETTINGS.visualStyle;

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
    };
  } catch {
    return DEFAULT_FLOAT_SETTINGS;
  }
}

export function saveSettings(settings: FloatSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    applySettingsToDOM(settings);
    listeners.forEach((l) => l(settings));
  } catch (e) {
    console.error("Failed to save FLOAT settings:", e);
  }
}

export function applySettingsToDOM(settings: FloatSettings): void {
  const clampedTransparency = Math.min(1.0, Math.max(0.6, settings.transparency));
  const clampedPillLength = Math.min(
    280,
    Math.max(200, settings.pillLength ?? DEFAULT_FLOAT_SETTINGS.pillLength)
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
