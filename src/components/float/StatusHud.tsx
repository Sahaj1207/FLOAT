import React from "react";
import { BatteryActivity, DownloadActivity, StatusActivity } from "../../activities/types";
import { TimerIcon } from "./Timer";
import { TrayIcon } from "./Shelf";
import { formatTimer } from "../../activities/timerStore";
import { ArrowDownToLine, BellDot, Bluetooth, Mic, MicOff, ScanText, FolderOpen, Moon, Phone, Share2, Sun, Zap } from "lucide-react";
import { openDownload } from "../../platform";
import { AppIcon } from "./AppIcon";
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
          {activity.battery != null && <BatteryBadge percent={activity.battery} />}
        </div>
      );
    case "download":
      return <DownloadHud activity={activity} />;
    case "mic":
      return (
        <div className="status-hud">
          {activity.muted ? (
            <MicOff className="status-hud-icon mic-off" strokeWidth={2.2} />
          ) : (
            <Mic className="status-hud-icon" strokeWidth={2.2} />
          )}
          <span className="status-hud-label">{activity.muted ? "Microphone off" : "Microphone on"}</span>
        </div>
      );
    case "textCopied":
      return (
        <div className="status-hud">
          <ScanText className={`status-hud-icon ${activity.lines ? "copied" : ""}`} strokeWidth={2.2} />
          <span className="status-hud-label">{activity.lines ? "Copied text" : "No text found"}</span>
          {activity.lines > 0 && (
            <span className="status-hud-detail" title={activity.preview}>
              {activity.lines > 1 ? `${activity.lines} lines` : activity.preview}
            </span>
          )}
        </div>
      );
    case "focusSummary":
      return (
        <div className="status-hud">
          <BellDot className="status-hud-icon focus" strokeWidth={2.2} />
          <span className="status-hud-label">
            {activity.count} {activity.count === 1 ? "notification" : "notifications"} while you focused
          </span>
          <span className="status-hud-detail">{activity.apps.slice(0, 2).join(", ")}</span>
        </div>
      );
    case "call":
      return (
        <div className="status-hud">
          {activity.appId ? (
            <AppIcon appId={activity.appId} appName={activity.appName} size={22} />
          ) : (
            <Phone className="status-hud-icon call" fill="currentColor" strokeWidth={0} />
          )}
          <span className="status-hud-label status-hud-grow">{activity.caller}</span>
          <span className="status-hud-call-badge">
            <Phone size={11} fill="currentColor" strokeWidth={0} />
            Incoming call
          </span>
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

const DownloadHud: React.FC<{ activity: DownloadActivity }> = ({ activity }) => {
  const Icon = activity.nearby ? Share2 : ArrowDownToLine;
  return (
    <div className="status-hud">
      <Icon className="status-hud-icon download" strokeWidth={2.2} />
      <span className="status-hud-label">{activity.nearby ? "Received" : "Downloaded"}</span>
      <span className="status-hud-detail status-hud-file" title={activity.name}>
        {activity.name}
      </span>
      <button
        type="button"
        className="status-hud-btn"
        onClick={(e) => {
          e.stopPropagation();
          openDownload(activity.path, true);
        }}
        data-no-drag="true"
        aria-label="Show in folder"
        title="Show in folder"
      >
        <FolderOpen size={13} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="status-hud-btn primary"
        onClick={(e) => {
          e.stopPropagation();
          openDownload(activity.path);
        }}
        data-no-drag="true"
      >
        Open
      </button>
    </div>
  );
};

/** "80%" with a small battery cell, red when low. */
const BatteryBadge: React.FC<{ percent: number }> = ({ percent }) => {
  const low = percent <= 20;
  return (
    <span className={`status-hud-battery bt ${low ? "low" : ""}`}>
      <span className="status-hud-percent">{percent}%</span>
      <span className="status-hud-cell">
        <span className="status-hud-cell-fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
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
