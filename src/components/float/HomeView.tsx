import React, { useEffect, useState } from "react";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { getPowerState, subscribeToPower, PowerPayload } from "../../platform";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
import { TimerTile } from "./Timer";
import { QuickToggles } from "./ControlCenter";
import { CurrentLyric } from "./Lyrics";
import "./HomeView.css";

interface HomeViewProps {
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
}

/** Mac-style home: the player on the left, glanceable widgets on the right. */
export const HomeView: React.FC<HomeViewProps> = ({ media, multiState, onSelectSession }) => (
  <div className="home-view">
    <div className="home-media">
      {media?.hasMedia ? (
        <MediaWidgetSurface
          media={media}
          multiState={multiState}
          onSelectSession={onSelectSession}
          layout="horizontal"
          subline={<CurrentLyric media={media} />}
        />
      ) : (
        <div className="home-media-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
          <span>Nothing playing</span>
        </div>
      )}
    </div>
    <div className="home-widgets">
      <ClockTile />
      <TimerTile />
      <QuickToggles />
    </div>
  </div>
);

/** Time and date, with the battery level alongside on laptops. */
const ClockTile: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  const power = usePower();
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="home-tile">
      <span className="home-tile-big">{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
      <div className="home-tile-line">
        <span className="home-tile-caption">
          {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </span>
        {power && (
          <span className="home-battery" title={power.charging ? "Charging" : "On battery"}>
            <span className="home-tile-caption">{power.percent}%</span>
            <span className={`home-battery-cell ${power.charging ? "charging" : power.percent <= 20 ? "low" : ""}`}>
              <span style={{ width: `${power.percent}%` }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

function usePower(): PowerPayload | null {
  const [power, setPower] = useState<PowerPayload | null>(null);
  useEffect(() => {
    let isMounted = true;
    const refresh = () => getPowerState().then((state) => isMounted && setPower(state));
    refresh();
    const unlisten = subscribeToPower((state) => isMounted && setPower(state));
    // Plug events cover charging changes; refresh the level occasionally.
    const timer = setInterval(refresh, 60_000);
    return () => {
      isMounted = false;
      clearInterval(timer);
      unlisten.then((fn) => fn());
    };
  }, []);
  return power;
}

export default HomeView;
