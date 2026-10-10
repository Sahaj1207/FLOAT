import React, { useEffect, useState } from "react";
import { MediaSession, MultiSessionState } from "../../platform/media";
import { MediaWidgetSurface } from "./MediaWidgetSurface";
import { CurrentLyric } from "./Lyrics";
import { useNextEvent, upcomingLabel, WeatherChip } from "./Widgets";
import { useTasks } from "../../activities/tasksStore";
import "./HomeView.css";

interface HomeViewProps {
  media: MediaSession | null;
  multiState?: MultiSessionState | null;
  onSelectSession?: (sessionId: string) => void;
  onOpenTasks: () => void;
}

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Focused Home: the player (or a large clock when nothing plays) and one
 * calm line beneath it. Everything else lives one tab away.
 */
export const HomeView: React.FC<HomeViewProps> = ({ media, multiState, onSelectSession, onOpenTasks }) => {
  const now = useNow(10_000);
  const playing = !!media?.hasMedia;

  return (
    <div className="home">
      <div className="home-main">
        {playing ? (
          <MediaWidgetSurface
            media={media}
            multiState={multiState}
            onSelectSession={onSelectSession}
            layout="horizontal"
            subline={<CurrentLyric media={media} />}
          />
        ) : (
          <div className="home-clock">
            <span className="home-clock-time">{timeOf(now)}</span>
            <span className="home-clock-date">
              {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
        )}
      </div>
      <HomeLine now={now} showTime={playing} onOpenTasks={onOpenTasks} />
    </div>
  );
};

/** time · weather · the next event or task. */
const HomeLine: React.FC<{ now: Date; showTime: boolean; onOpenTasks: () => void }> = ({ now, showTime, onOpenTasks }) => {
  const event = useNextEvent();
  const nextTask = useTasks().find((t) => !t.done);

  return (
    <div className="home-line">
      {showTime && <span className="home-line-time">{timeOf(now)}</span>}
      <WeatherChip />
      {event ? (
        <span className="home-line-next" title={event.location ?? undefined}>
          <span className="home-line-dot event" />
          <span className="home-line-text">{event.title}</span>
          <span className="home-line-when">{upcomingLabel(event, now.getTime())}</span>
        </span>
      ) : nextTask ? (
        <button
          type="button"
          className="home-line-next"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTasks();
          }}
          data-no-drag="true"
        >
          <span className="home-line-dot task" />
          <span className="home-line-text">{nextTask.title}</span>
        </button>
      ) : (
        showTime && (
          <span className="home-line-next">
            <span className="home-line-text muted">
              {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </span>
        )
      )}
    </div>
  );
};

export default HomeView;
