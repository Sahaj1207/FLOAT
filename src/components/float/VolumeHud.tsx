import React from "react";
import { motion } from "framer-motion";
import { VolumeActivity } from "../../activities/types";
import { toggleMute } from "../../platform";
import "./VolumeHud.css";

interface VolumeHudProps {
  activity: VolumeActivity;
  onChange: (state: { level: number; muted: boolean }) => void;
}

/** Volume level shown in the pill while the user adjusts it. */
export const VolumeHud: React.FC<VolumeHudProps> = ({ activity, onChange }) => {
  const { level, muted } = activity;
  const percent = Math.round(level * 100);
  const shown = muted ? 0 : percent;

  return (
    <div className="volume-hud">
      <button
        type="button"
        className="volume-hud-icon"
        onClick={(e) => {
          e.stopPropagation();
          toggleMute().then((state) => state && onChange(state));
        }}
        data-no-drag="true"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
          {muted || shown === 0 ? (
            <path d="m23 9-6 6M17 9l6 6" />
          ) : (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              {shown > 50 && <path d="M19 5a10 10 0 0 1 0 14" />}
            </>
          )}
        </svg>
      </button>
      <div className="volume-hud-track">
        <motion.div
          className="volume-hud-fill"
          initial={false}
          animate={{ width: `${shown}%` }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      </div>
      <span className="volume-hud-value">{muted ? "Muted" : percent}</span>
    </div>
  );
};

export default VolumeHud;
