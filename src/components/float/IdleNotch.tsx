import React, { useEffect, useState } from "react";
import type { IdleClock } from "../../services/settings";

interface IdleNotchProps {
  isPreview: boolean;
  hasUnread: boolean;
  clock?: IdleClock;
}

// Time and date take turns this often when both are shown.
const TURN_MS = 4000;

const timeText = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dateText = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/** The notch with nothing live: blank at rest (or the time, if chosen), time and date on hover. */
export const IdleNotch: React.FC<IdleNotchProps> = ({ isPreview, hasUnread, clock = "off" }) => {
  const [now, setNow] = useState(() => new Date());
  const [showDate, setShowDate] = useState(false);
  const resting = !isPreview && clock !== "off";

  useEffect(() => {
    if (!isPreview && !resting) return;
    setNow(new Date());
    const alternate = resting && clock === "timeDate";
    const timer = setInterval(() => {
      setNow(new Date());
      if (alternate) setShowDate((d) => !d);
    }, alternate ? TURN_MS : 10_000);
    if (!alternate) setShowDate(false);
    return () => clearInterval(timer);
  }, [isPreview, resting, clock]);

  if (!isPreview) {
    return (
      <>
        {resting && (
          <span className="idle-clock" aria-label={`${timeText(now)}, ${dateText(now)}`}>
            <span className={`idle-clock-text ${showDate ? "" : "on"}`}>{timeText(now)}</span>
            {clock === "timeDate" && <span className={`idle-clock-text ${showDate ? "on" : ""}`}>{dateText(now)}</span>}
          </span>
        )}
        {hasUnread && <span className="idle-notch-unread" aria-label="Unread notifications" />}
      </>
    );
  }

  return (
    <div className="idle-notch-preview">
      <span className="idle-notch-time">
        {timeText(now)}
      </span>
      <span className="idle-notch-date">
        {dateText(now)}
        {hasUnread && <span className="idle-notch-unread inline" aria-label="Unread notifications" />}
      </span>
    </div>
  );
};

export default IdleNotch;
