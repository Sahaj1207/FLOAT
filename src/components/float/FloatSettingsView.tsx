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
} from "../../services/settings";
import "./FloatSettingsView.css";

interface FloatSettingsViewProps {
  onClose?: () => void;
}

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
    const newTransparency = Math.min(1.0, Math.max(0.6, rawVal / 100));
    const nextSettings = { ...settings, transparency: newTransparency };
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handlePillLengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = parseInt(e.target.value, 10);
    const newLength = Math.min(280, Math.max(200, rawVal));
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
              {visualStyle === "softGlass" ? "Soft Glass" : visualStyle}
            </span>
          </div>

          <div className="float-setting-segmented-group" role="radiogroup" aria-label="Visual Style">
            <button
              type="button"
              role="radio"
              aria-checked={visualStyle === "default"}
              className={`float-setting-segment-btn ${visualStyle === "default" ? "active" : ""}`}
              onClick={() => handleVisualStyleChange("default")}
              data-no-drag="true"
            >
              <span>Default</span>
              <span className="float-setting-segment-desc">Balanced glass</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={visualStyle === "minimal"}
              className={`float-setting-segment-btn ${visualStyle === "minimal" ? "active" : ""}`}
              onClick={() => handleVisualStyleChange("minimal")}
              data-no-drag="true"
            >
              <span>Minimal</span>
              <span className="float-setting-segment-desc">Calm & crisp</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={visualStyle === "softGlass"}
              className={`float-setting-segment-btn ${visualStyle === "softGlass" ? "active" : ""}`}
              onClick={() => handleVisualStyleChange("softGlass")}
              data-no-drag="true"
            >
              <span>Soft Glass</span>
              <span className="float-setting-segment-desc">Rich depth</span>
            </button>
          </div>
        </div>

        {/* Glass Transparency */}
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
                Glass Transparency
              </label>
            </div>
            <span className="float-setting-value-badge">{transparencyPercent}%</span>
          </div>

          <div className="float-setting-control-group">
            <input
              id="glass-transparency-slider"
              type="range"
              min="60"
              max="100"
              step="1"
              value={transparencyPercent}
              onChange={handleTransparencyChange}
              className="float-setting-slider"
              aria-label="Glass Transparency"
              aria-valuemin={60}
              aria-valuemax={100}
              aria-valuenow={transparencyPercent}
              data-no-drag="true"
            />
            <div className="float-setting-hints">
              <span>Translucent (60%)</span>
              <span>Solid Dark (100%)</span>
            </div>
          </div>
        </div>

        {/* Compact Pill Length */}
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
                Compact Pill Length
              </label>
            </div>
            <span className="float-setting-value-badge">{pillLength} px</span>
          </div>

          <div className="float-setting-control-group">
            <input
              id="compact-pill-length-slider"
              type="range"
              min="200"
              max="280"
              step="1"
              value={pillLength}
              onChange={handlePillLengthChange}
              className="float-setting-slider"
              aria-label="Compact Pill Length"
              aria-valuemin={200}
              aria-valuemax={280}
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
              {idleBehavior === "alwaysOrb" ? "Always Orb" : idleBehavior === "alwaysPill" ? "Always Pill" : "Remember"}
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
              <span>Always Orb</span>
              <span className="float-setting-segment-desc">Circular presence</span>
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
              <span className="float-setting-segment-desc">Last mode (Default)</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={idleBehavior === "alwaysPill"}
              className={`float-setting-segment-btn ${idleBehavior === "alwaysPill" ? "active" : ""}`}
              onClick={() => handleIdleBehaviorChange("alwaysPill")}
              data-no-drag="true"
            >
              <span>Always Pill</span>
              <span className="float-setting-segment-desc">Compact player</span>
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
