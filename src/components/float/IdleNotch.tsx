import React, { useEffect, useState } from "react";

interface IdleNotchProps {
  isPreview: boolean;
  hasUnread: boolean;
}

/** The notch with nothing live: blank at rest, time and date on hover. */
export const IdleNotch: React.FC<IdleNotchProps> = ({ isPreview, hasUnread }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isPreview) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, [isPreview]);

  if (!isPreview) {
    return hasUnread ? <span className="idle-notch-unread" aria-label="Unread notifications" /> : null;
  }

  return (
    <div className="idle-notch-preview">
      <span className="idle-notch-time">
        {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </span>
      <span className="idle-notch-date">
        {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        {hasUnread && <span className="idle-notch-unread inline" aria-label="Unread notifications" />}
      </span>
    </div>
  );
};

export default IdleNotch;
