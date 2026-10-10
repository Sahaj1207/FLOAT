import React from "react";
import { BatteryActivity, StatusActivity } from "../../activities/types";
import { TimerIcon } from "./Timer";
import { TrayIcon } from "./Shelf";
import { formatTimer } from "../../activities/timerStore";
import { Bluetooth, Moon, Sun, Zap } from "lucide-react";
import "./StatusHud.css";

/** Brief system-status live activities: charging, low battery, camera/mic, Focus. */
export const StatusHud: React.FC<{ activity: StatusActivity }> = ({ activity }) => {
  switch (activity.kind) {
    case "battery":
      return <BatteryHud activity={activity} />;
    case "privacy":
      return (
        <div className="status-hud">
          <span className={`status-hud-dot ${activity.device}`} />
          <span className="status-hud-label">
            {activity.device === "camera" ? "Camera" : "Microphone"} {activity.app ? "in use" : "off"}
          </span>
          {activity.app && <span className="status-hud-detail">{activity.app}</span>}
        </div>
      );
    case "timerDone":
      return (
        <div className="status-hud">
          <TimerIcon />
          <span className="status-hud-label">Timer done</span>
          <span className="status-hud-detail">{formatTimer(activity.durationMs)}</span>
        </div>
      );
    case "brightness":
      return (
        <div className="status-hud">
          <SunIcon className="status-hud-icon sun" />
          <div className="status-hud-track">
            <span className="status-hud-track-fill" style={{ width: `${activity.level}%` }} />
          </div>
          <span className="status-hud-percent">{activity.level}</span>
        </div>
      );
    case "shelf":
      return (
        <div className="status-hud">
          <TrayIcon className="status-hud-icon shelf" />
          <span className="status-hud-label">Added to Shelf</span>
          <span className="status-hud-detail">{activity.count === 1 ? "1 item" : `${activity.count} items`}</span>
        </div>
      );
    case "bluetooth":
      return (
        <div className="status-hud">
          <Bluetooth className="status-hud-icon bluetooth" strokeWidth={2.2} />
          <span className="status-hud-label">{activity.connected ? "Connected" : "Disconnected"}</span>
          <span className="status-hud-detail">{activity.device}</span>
        </div>
      );
    case "focus":
      return (
        <div className="status-hud">
          <Moon className="status-hud-icon focus" fill="currentColor" strokeWidth={0} />
          <span className="status-hud-label">Focus</span>
          <span className="status-hud-detail">{activity.active ? "On" : "Off"}</span>
        </div>
      );
  }
};

export const SunIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <Sun className={className} strokeWidth={2.2} />
);

const BatteryHud: React.FC<{ activity: BatteryActivity }> = ({ activity }) => {
  const { percent, charging, low } = activity;
  const tone = charging ? "charging" : low ? "low" : "";
  return (
    <div className="status-hud">
      {charging ? (
        <Zap className="status-hud-icon charging" fill="currentColor" strokeWidth={0} />
      ) : (
        <span className={`status-hud-dot ${tone}`} />
      )}
      <span className="status-hud-label">{charging ? "Charging" : low ? "Low Battery" : "On Battery"}</span>
      <span className={`status-hud-battery ${tone}`}>
        <span className="status-hud-percent">{percent}%</span>
        <span className="status-hud-cell">
          <span className="status-hud-cell-fill" style={{ width: `${percent}%` }} />
        </span>
      </span>
    </div>
  );
};

export default StatusHud;
