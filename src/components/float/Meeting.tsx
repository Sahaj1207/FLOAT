import React, { useEffect, useState } from "react";
import { CalendarClock, Video, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MeetingActivity } from "../../activities/types";
import "./Meeting.css";

/** "in 4 min", "in 30 s", "now", "started 2 min ago". */
function untilLabel(start: number, now: number): string {
  const s = Math.round((start - now) / 1000);
  if (s > 90) return `in ${Math.round(s / 60)} min`;
  if (s > 0) return `in ${s} s`;
  if (s > -60) return "now";
  return `started ${Math.round(-s / 60)} min ago`;
}

/** The next meeting, counting down, with Join when it has a link. */
export const MeetingPill: React.FC<{ activity: MeetingActivity; onDismiss: () => void }> = ({ activity, onDismiss }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const soon = activity.start - now < 2 * 60_000;

  return (
    <div className="meeting-pill">
      <CalendarClock className={`meeting-icon ${soon ? "soon" : ""}`} strokeWidth={2.2} />
      <span className="meeting-title">{activity.title}</span>
      <span className={`meeting-when ${soon ? "soon" : ""}`}>{untilLabel(activity.start, now)}</span>
      {activity.joinUrl ? (
        <button
          type="button"
          className="meeting-join"
          onClick={(e) => {
            e.stopPropagation();
            openUrl(activity.joinUrl!).catch(() => {});
            onDismiss();
          }}
          data-no-drag="true"
        >
          <Video size={12} strokeWidth={2.4} />
          Join
        </button>
      ) : (
        <button
          type="button"
          className="meeting-dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          data-no-drag="true"
          aria-label="Dismiss"
        >
          <X size={12} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
};
