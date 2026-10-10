import React from "react";
import { motion } from "framer-motion";
import { VolumeActivity } from "../../activities/types";
import { toggleMute } from "../../platform";
import { Volume1, Volume2, VolumeX } from "lucide-react";
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
        {muted || shown === 0 ? <VolumeX strokeWidth={2.2} /> : shown > 50 ? <Volume2 strokeWidth={2.2} /> : <Volume1 strokeWidth={2.2} />}
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
