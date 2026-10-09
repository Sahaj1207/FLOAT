import { MediaSession } from "../platform/media";

/**
 * Live activities are the things the island can show. At most two are
 * visible at once: the highest-priority one owns the pill, and the next one
 * detaches into a split bubble beside it.
 */
export const ActivityPriority = {
  media: 10,
  notification: 100,
  // User-initiated feedback wins over everything else.
  volume: 120,
} as const;

export interface NotificationActivity {
  kind: "notification";
  id: string;
  priority: number;
  appId?: string;
  appName?: string;
  title?: string;
  body?: string;
}

export interface MediaActivity {
  kind: "media";
  id: string;
  priority: number;
  session: MediaSession;
}

export interface VolumeActivity {
  kind: "volume";
  id: string;
  priority: number;
  level: number;
  muted: boolean;
}

export type Activity = NotificationActivity | MediaActivity | VolumeActivity;

export type ActivityKind = Activity["kind"];
