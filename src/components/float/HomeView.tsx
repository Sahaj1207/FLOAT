import React, { useEffect, useState } from "react";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { getPowerState, subscribeToPower, PowerPayload } from "../../platform";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
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
        <MediaWidgetSurface media={media} multiState={multiState} onSelectSession={onSelectSession} layout="horizontal" />
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
      <BatteryTile />
    </div>
  </div>
);

const ClockTile: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="home-tile">
      <span className="home-tile-big">{now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
      <span className="home-tile-caption">
        {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
      </span>
    </div>
  );
};

const BatteryTile: React.FC = () => {
  const [power, setPower] = useState<PowerPayload | null>(null);
  useEffect(() => {
    let isMounted = true;
    getPowerState().then((state) => isMounted && setPower(state));
    const unlisten = subscribeToPower((state) => isMounted && setPower(state));
    // Plug events cover charging changes; refresh the level occasionally.
    const timer = setInterval(() => getPowerState().then((state) => isMounted && setPower(state)), 60_000);
    return () => {
      isMounted = false;
      clearInterval(timer);
      unlisten.then((fn) => fn());
    };
  }, []);
  if (!power) return null;
  return (
    <div className="home-tile home-tile-row">
      <span className={`home-battery-cell ${power.charging ? "charging" : power.percent <= 20 ? "low" : ""}`}>
        <span style={{ width: `${power.percent}%` }} />
      </span>
      <span className="home-tile-value">{power.percent}%</span>
      <span className="home-tile-caption">{power.charging ? "Charging" : "Battery"}</span>
    </div>
  );
};

export default HomeView;
