import React, { useState, useEffect } from "react";
import {
  FloatSettings,
  AnimationIntensity,
  IdleBehavior,
  VisualStyle,
  loadSettings,
  saveSettings,
  subscribeToSettings,
  DEFAULT_FLOAT_SETTINGS,
  PILL_LENGTH_MIN,
  PILL_LENGTH_MAX,
  GLASS_TINT_MIN,
  GLASS_TINT_MAX,
} from "../../services/settings";
import { getAutostart, getHotkey, setAutostart, subscribeToAutostart } from "../../platform";
import "./FloatSettingsView.css";

interface FloatSettingsViewProps {
  onClose?: () => void;
}

/** A text field that saves on Enter or when focus leaves, not on every key. */
const CommitInput: React.FC<{
  value: string;
  placeholder: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
}> = ({ value, placeholder, ariaLabel, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="float-setting-input"
      type="text"
      spellCheck={false}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      data-no-drag="true"
    />
  );
};

export const FloatSettingsView: React.FC<FloatSettingsViewProps> = () => {
  const [settings, setSettings] = useState<FloatSettings>(() => loadSettings());

  useEffect(() => {
    // Keep local component state in sync with loaded settings
    setSettings(loadSettings());
    return subscribeToSettings((newSettings) => {
      setSettings(newSettings);
    });
  }, []);

  const handleTransparencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseInt(e.target.value, 10);
    const newTransparency = Math.min(GLASS_TINT_MAX, Math.max(GLASS_TINT_MIN, rawVal / 100));
    const nextSettings = { ...settings, transparency: newTransparency };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handlePillLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseInt(e.target.value, 10);
    const newLength = Math.min(PILL_LENGTH_MAX, Math.max(PILL_LENGTH_MIN, rawVal));
    const nextSettings = { ...settings, pillLength: newLength };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleOrbSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseInt(e.target.value, 10);
    const newSize = Math.min(56, Math.max(44, rawVal));
    const nextSettings = { ...settings, orbSize: newSize };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleIntensityChange = (intensity: AnimationIntensity) => {
    const nextSettings = { ...settings, animationIntensity: intensity };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleIdleBehaviorChange = (behavior: IdleBehavior) => {
    const nextSettings = { ...settings, idleBehavior: behavior };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleVisualStyleChange = (style: VisualStyle) => {
    const nextSettings = { ...settings, visualStyle: style };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleTogglePresence = () => {
    const nextSettings = { ...settings, notificationPresence: !settings.notificationPresence };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleTogglePreview = () => {
    const nextSettings = { ...settings, notificationPreview: !settings.notificationPreview };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleToggleContent = () => {
    const nextSettings = { ...settings, notificationContent: !settings.notificationContent };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  // Launch at startup lives in the OS, not in saved settings.
  const [autostart, setAutostartState] = useState(false);
  const [hotkey, setHotkey] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | null = null;
    getHotkey().then((key) => {
      if (isMounted) setHotkey(key);
    });
    getAutostart().then((enabled) => {
      if (isMounted) setAutostartState(enabled);
    });
    subscribeToAutostart((enabled) => {
      if (isMounted) setAutostartState(enabled);
    }).then((fn) => {
      if (isMounted) unlisten = fn;
      else fn();
    });
    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, []);

  const handleToggleAutostart = () => {
    setAutostart(!autostart).then(setAutostartState);
  };

  const update = (patch: Partial<FloatSettings>) => {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleToggleOpenOnHover = () => {
    const nextSettings = { ...settings, openOnHover: !settings.openOnHover };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleToggleSyncedLyrics = () => {
    const nextSettings = { ...settings, syncedLyrics: !settings.syncedLyrics };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleToggleClipboardHistory = () => {
    const nextSettings = { ...settings, clipboardHistory: !settings.clipboardHistory };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleToggleHideInFullscreen = () => {
    const nextSettings = { ...settings, hideInFullscreen: !settings.hideInFullscreen };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleReset = () => {
    const nextSettings = { ...DEFAULT_FLOAT_SETTINGS };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const transparencyPercent = Math.round(settings.transparency * 100);
  const pillLength = settings.pillLength ?? DEFAULT_FLOAT_SETTINGS.pillLength;
  const orbSize = settings.orbSize ?? DEFAULT_FLOAT_SETTINGS.orbSize;
  const animationIntensity = settings.animationIntensity ?? DEFAULT_FLOAT_SETTINGS.animationIntensity;
  const idleBehavior = settings.idleBehavior ?? DEFAULT_FLOAT_SETTINGS.idleBehavior;
  const visualStyle = settings.visualStyle ?? DEFAULT_FLOAT_SETTINGS.visualStyle;
  const notificationPresence = settings.notificationPresence ?? DEFAULT_FLOAT_SETTINGS.notificationPresence;
  const notificationPreview = settings.notificationPreview ?? DEFAULT_FLOAT_SETTINGS.notificationPreview;
  const notificationContent = settings.notificationContent ?? DEFAULT_FLOAT_SETTINGS.notificationContent;

  return (
    <div className="float-settings-view">
      <div className="float-settings-header-row">
        <div className="float-settings-title-group">
          <span className="float-settings-main-title">Settings</span>
          <span className="float-settings-subtitle">Appearance, Style, Dimensions & Idle</span>
        </div>
      </div>

      <div className="float-settings-body">
        {/* Visual Style Preset */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="float-setting-name">Visual Style</span>
            </div>
            <span className="float-setting-value-badge" style={{ textTransform: "capitalize" }}>
              {visualStyle}
            </span>
          </div>

          <div className="float-setting-segmented-group" role="radiogroup" aria-label="Visual Style">
            {(
              [
                ["auto", "Auto", "Notch · glass pill"],
                ["glass", "Glass", "Liquid glass"],
                ["black", "Black", "Solid black"],
              ] as const
            ).map(([value, label, desc]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={visualStyle === value}
                className={`float-setting-segment-btn ${visualStyle === value ? "active" : ""}`}
                onClick={() => handleVisualStyleChange(value)}
                data-no-drag="true"
              >
                <span>{label}</span>
                <span className="float-setting-segment-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Glass Tint */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a7 7 0 1 0 10 10" />
              </svg>
              <label htmlFor="glass-transparency-slider" className="float-setting-name">
                Glass Tint
              </label>
            </div>
            <span className="float-setting-value-badge">{transparencyPercent}%</span>
          </div>

          <div className="float-setting-control-group">
            <input
              id="glass-transparency-slider"
              type="range"
              min={GLASS_TINT_MIN * 100}
              max={GLASS_TINT_MAX * 100}
              step="1"
              value={transparencyPercent}
              onChange={handleTransparencyChange}
              className="float-setting-slider"
              aria-label="Glass Tint"
              aria-valuemin={GLASS_TINT_MIN * 100}
              aria-valuemax={GLASS_TINT_MAX * 100}
              aria-valuenow={transparencyPercent}
              data-no-drag="true"
            />
            <div className="float-setting-hints">
              <span>Translucent (60%)</span>
              <span>Solid Dark (100%)</span>
            </div>
          </div>
        </div>

        {/* Activity Width */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <rect x="2" y="7" width="20" height="10" rx="5" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <label htmlFor="compact-pill-length-slider" className="float-setting-name">
                Activity Width
              </label>
            </div>
            <span className="float-setting-value-badge">{pillLength} px</span>
          </div>

          <div className="float-setting-control-group">
            <input
              id="compact-pill-length-slider"
              type="range"
              min={PILL_LENGTH_MIN}
              max={PILL_LENGTH_MAX}
              step="1"
              value={pillLength}
              onChange={handlePillLengthChange}
              className="float-setting-slider"
              aria-label="Activity Width"
              aria-valuemin={PILL_LENGTH_MIN}
              aria-valuemax={PILL_LENGTH_MAX}
              aria-valuenow={pillLength}
              data-no-drag="true"
            />
            <div className="float-setting-hints">
              <span>Compact (200px)</span>
              <span>Spacious (280px)</span>
            </div>
          </div>
        </div>

        {/* Orb Size */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <circle cx="12" cy="12" r="8" />
              </svg>
              <label htmlFor="orb-size-slider" className="float-setting-name">
                Orb Size
              </label>
            </div>
            <span className="float-setting-value-badge">{orbSize} px</span>
          </div>

          <div className="float-setting-control-group">
            <input
              id="orb-size-slider"
              type="range"
              min="44"
              max="56"
              step="1"
              value={orbSize}
              onChange={handleOrbSizeChange}
              className="float-setting-slider"
              aria-label="Orb Size"
              aria-valuemin={44}
              aria-valuemax={56}
              aria-valuenow={orbSize}
              data-no-drag="true"
            />
            <div className="float-setting-hints">
              <span>Compact (44px)</span>
              <span>Default (48px)</span>
              <span>Large (56px)</span>
            </div>
          </div>
        </div>

        {/* Idle Behavior */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="float-setting-name">Idle Behavior</span>
            </div>
            <span className="float-setting-value-badge" style={{ textTransform: "capitalize" }}>
              {idleBehavior === "alwaysOrb" ? "Orb" : idleBehavior === "alwaysPill" ? "Island" : "Remember"}
            </span>
          </div>

          <div className="float-setting-segmented-group" role="radiogroup" aria-label="Idle Behavior">
            <button
              type="button"
              role="radio"
              aria-checked={idleBehavior === "alwaysOrb"}
              className={`float-setting-segment-btn ${idleBehavior === "alwaysOrb" ? "active" : ""}`}
              onClick={() => handleIdleBehaviorChange("alwaysOrb")}
              data-no-drag="true"
            >
              <span>Orb</span>
              <span className="float-setting-segment-desc">Shrink to a circle</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={idleBehavior === "remember"}
              className={`float-setting-segment-btn ${idleBehavior === "remember" ? "active" : ""}`}
              onClick={() => handleIdleBehaviorChange("remember")}
              data-no-drag="true"
            >
              <span>Remember</span>
              <span className="float-setting-segment-desc">Last mode</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={idleBehavior === "alwaysPill"}
              className={`float-setting-segment-btn ${idleBehavior === "alwaysPill" ? "active" : ""}`}
              onClick={() => handleIdleBehaviorChange("alwaysPill")}
              data-no-drag="true"
            >
              <span>Island</span>
              <span className="float-setting-segment-desc">Stay as the notch</span>
            </button>
          </div>
        </div>

        {/* Animation Intensity */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="float-setting-name">Animation Intensity</span>
            </div>
            <span className="float-setting-value-badge" style={{ textTransform: "capitalize" }}>
              {animationIntensity}
            </span>
          </div>

          <div className="float-setting-segmented-group" role="radiogroup" aria-label="Animation Intensity">
            <button
              type="button"
              role="radio"
              aria-checked={animationIntensity === "subtle"}
              className={`float-setting-segment-btn ${animationIntensity === "subtle" ? "active" : ""}`}
              onClick={() => handleIntensityChange("subtle")}
              data-no-drag="true"
            >
              <span>Subtle</span>
              <span className="float-setting-segment-desc">Calmer</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={animationIntensity === "balanced"}
              className={`float-setting-segment-btn ${animationIntensity === "balanced" ? "active" : ""}`}
              onClick={() => handleIntensityChange("balanced")}
              data-no-drag="true"
            >
              <span>Balanced</span>
              <span className="float-setting-segment-desc">Recommended</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={animationIntensity === "expressive"}
              className={`float-setting-segment-btn ${animationIntensity === "expressive" ? "active" : ""}`}
              onClick={() => handleIntensityChange("expressive")}
              data-no-drag="true"
            >
              <span>Expressive</span>
              <span className="float-setting-segment-desc">Lively</span>
            </button>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="float-setting-name">Notification Preferences</span>
            </div>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Notification Presence</span>
              <span className="float-setting-toggle-desc">Show notification indicators on FLOAT</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationPresence}
              className={`float-setting-switch ${notificationPresence ? "checked" : ""}`}
              onClick={handleTogglePresence}
              data-no-drag="true"
              aria-label="Toggle Notification Presence"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Notification Preview</span>
              <span className="float-setting-toggle-desc">Open a compact preview when a notification Orb is clicked</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationPreview}
              disabled={!notificationPresence}
              className={`float-setting-switch ${notificationPreview && notificationPresence ? "checked" : ""} ${!notificationPresence ? "disabled" : ""}`}
              onClick={handleTogglePreview}
              data-no-drag="true"
              aria-label="Toggle Notification Preview"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Notification Content</span>
              <span className="float-setting-toggle-desc">Show notification app and message details in the preview</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationContent}
              disabled={!notificationPresence || !notificationPreview}
              className={`float-setting-switch ${notificationContent && notificationPresence && notificationPreview ? "checked" : ""} ${!notificationPresence || !notificationPreview ? "disabled" : ""}`}
              onClick={handleToggleContent}
              data-no-drag="true"
              aria-label="Toggle Notification Content"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>
        </div>

        {/* Widgets */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="float-setting-icon">
                <rect x="3" y="3" width="8" height="8" rx="2" />
                <rect x="13" y="3" width="8" height="8" rx="2" />
                <rect x="3" y="13" width="8" height="8" rx="2" />
                <rect x="13" y="13" width="8" height="8" rx="2" />
              </svg>
              <span className="float-setting-name">Widgets</span>
            </div>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Weather</span>
              <span className="float-setting-toggle-desc">Show current weather on Home. Sends your city name to open-meteo.com</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.weatherEnabled}
              className={`float-setting-switch ${settings.weatherEnabled ? "checked" : ""}`}
              onClick={() => update({ weatherEnabled: !settings.weatherEnabled })}
              data-no-drag="true"
              aria-label="Toggle Weather"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>
          {settings.weatherEnabled && (
            <div className="float-setting-field-row">
              <CommitInput
                value={settings.weatherCity}
                placeholder="City, e.g. Bengaluru"
                ariaLabel="Weather city"
                onCommit={(weatherCity) => update({ weatherCity })}
              />
              <button
                type="button"
                className="float-setting-unit-btn"
                onClick={() => update({ weatherFahrenheit: !settings.weatherFahrenheit })}
                data-no-drag="true"
                aria-label="Toggle temperature unit"
              >
                {settings.weatherFahrenheit ? "°F" : "°C"}
              </button>
            </div>
          )}

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Calendar</span>
              <span className="float-setting-toggle-desc">
                Paste your calendar's private ICS link (Google: Settings › your calendar › Secret address in iCal format). FLOAT downloads it to show your next event
              </span>
            </div>
          </div>
          <div className="float-setting-field-row">
            <CommitInput
              value={settings.calendarUrl}
              placeholder="https://… .ics"
              ariaLabel="Calendar ICS link"
              onCommit={(calendarUrl) => update({ calendarUrl })}
            />
          </div>
        </div>

        {/* System */}
        <div className="float-setting-card">
          <div className="float-setting-label-row">
            <div className="float-setting-label-left">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="float-setting-icon"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              <span className="float-setting-name">System</span>
            </div>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Open on Hover</span>
              <span className="float-setting-toggle-desc">Rest the pointer on the notch to open the panel; it closes when you move away. Off: click to open</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.openOnHover}
              className={`float-setting-switch ${settings.openOnHover ? "checked" : ""}`}
              onClick={handleToggleOpenOnHover}
              data-no-drag="true"
              aria-label="Toggle Open on Hover"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Hide in Fullscreen</span>
              <span className="float-setting-toggle-desc">Get out of the way of fullscreen games, videos and presentations</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hideInFullscreen}
              className={`float-setting-switch ${settings.hideInFullscreen ? "checked" : ""}`}
              onClick={handleToggleHideInFullscreen}
              data-no-drag="true"
              aria-label="Toggle Hide in Fullscreen"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Synced Lyrics</span>
              <span className="float-setting-toggle-desc">Show the current lyric line on Home. Sends the track title and artist to lrclib.net</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.syncedLyrics}
              className={`float-setting-switch ${settings.syncedLyrics ? "checked" : ""}`}
              onClick={handleToggleSyncedLyrics}
              data-no-drag="true"
              aria-label="Toggle Synced Lyrics"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Clipboard History</span>
              <span className="float-setting-toggle-desc">Remember recent copies in memory only. Content apps mark as private (like passwords) is never kept</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.clipboardHistory}
              className={`float-setting-switch ${settings.clipboardHistory ? "checked" : ""}`}
              onClick={handleToggleClipboardHistory}
              data-no-drag="true"
              aria-label="Toggle Clipboard History"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>

          <div className="float-setting-toggle-row">
            <div className="float-setting-toggle-left">
              <span className="float-setting-toggle-title">Launch at Startup</span>
              <span className="float-setting-toggle-desc">Start FLOAT when you sign in to Windows{hotkey ? `. ${hotkey} opens the island anytime` : ""}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autostart}
              className={`float-setting-switch ${autostart ? "checked" : ""}`}
              onClick={handleToggleAutostart}
              data-no-drag="true"
              aria-label="Toggle Launch at Startup"
            >
              <span className="float-setting-switch-handle" />
            </button>
          </div>
        </div>
      </div>

      <div className="float-settings-footer">
        <button
          type="button"
          className="float-settings-reset-btn"
          onClick={handleReset}
          data-no-drag="true"
          aria-label="Reset settings to defaults"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};

export default FloatSettingsView;
