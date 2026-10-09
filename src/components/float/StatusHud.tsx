import React from "react";
import { BatteryActivity, StatusActivity } from "../../activities/types";
import { TimerIcon } from "./Timer";
import { TrayIcon } from "./Shelf";
import { formatTimer } from "../../activities/timerStore";
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
          <svg className="status-hud-icon bluetooth" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 7 10 10-5 5V2l5 5L7 17" />
          </svg>
          <span className="status-hud-label">{activity.connected ? "Connected" : "Disconnected"}</span>
          <span className="status-hud-detail">{activity.device}</span>
        </div>
      );
    case "focus":
      return (
        <div className="status-hud">
          <svg className="status-hud-icon focus" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <span className="status-hud-label">Focus</span>
          <span className="status-hud-detail">{activity.active ? "On" : "Off"}</span>
        </div>
      );
  }
};

const BatteryHud: React.FC<{ activity: BatteryActivity }> = ({ activity }) => {
  const { percent, charging, low } = activity;
  const tone = charging ? "charging" : low ? "low" : "";
  return (
    <div className="status-hud">
      {charging ? (
        <svg className="status-hud-icon charging" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
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
