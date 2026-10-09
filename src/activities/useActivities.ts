import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MediaSession } from "../platform/media";
import { Activity, ActivityKind, ActivityPriority } from "./types";

interface TransientTimer {
  timer: ReturnType<typeof setTimeout>;
  onExpire?: () => void;
}

/**
 * Owns the island's activity stack.
 *
 * Ongoing activities (media) are derived from props; transient ones
 * (notifications, and later HUDs) are pushed with a lifetime. A transient of
 * the same kind replaces the previous one and restarts its timer.
 */
export function useActivities(media: MediaSession | null, ongoing: Activity[] = []) {
  const [transients, setTransients] = useState<Activity[]>([]);
  const timers = useRef(new Map<ActivityKind, TransientTimer>());

  const clearTimer = (kind: ActivityKind) => {
    const entry = timers.current.get(kind);
    if (entry) {
      clearTimeout(entry.timer);
      timers.current.delete(kind);
    }
    return entry;
  };

  /** End a transient early. Runs its onExpire, as if it had timed out. */
  const dismissKind = useCallback((kind: ActivityKind) => {
    const entry = clearTimer(kind);
    setTransients((prev) => prev.filter((a) => a.kind !== kind));
    entry?.onExpire?.();
  }, []);

  const show = useCallback(
    (activity: Activity, lifetimeMs: number, onExpire?: () => void) => {
      clearTimer(activity.kind);
      setTransients((prev) => [activity, ...prev.filter((a) => a.kind !== activity.kind)]);
      const timer = setTimeout(() => {
        timers.current.delete(activity.kind);
        setTransients((prev) => prev.filter((a) => a.kind !== activity.kind));
        onExpire?.();
      }, lifetimeMs);
      timers.current.set(activity.kind, { timer, onExpire });
    },
    []
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((entry) => clearTimeout(entry.timer));
      map.clear();
    };
  }, []);

  const activities = useMemo(() => {
    const list: Activity[] = [...transients, ...ongoing];
    if (media?.hasMedia) {
      list.push({ kind: "media", id: `media:${media.id}`, priority: ActivityPriority.media, session: media });
    }
    return list.sort((a, b) => b.priority - a.priority);
  }, [transients, ongoing, media]);

  return {
    activities,
    primary: activities[0] ?? null,
    secondary: activities[1] ?? null,
    show,
    dismissKind,
  };
}
