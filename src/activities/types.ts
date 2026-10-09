import { MediaSession } from "../platform/media";

/**
 * Live activities are the things the island can show. At most two are
 * visible at once: the highest-priority one owns the pill, and the next one
 * detaches into a split bubble beside it.
 */
export const ActivityPriority = {
  media: 10,
  notification: 100,
  focus: 104,
  privacy: 105,
  battery: 110,
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

export interface BatteryActivity {
  kind: "battery";
  id: string;
  priority: number;
  percent: number;
  charging: boolean;
  low: boolean;
}

export interface PrivacyActivity {
  kind: "privacy";
  id: string;
  priority: number;
  device: "camera" | "microphone";
  /** App now using the device, or null when it stopped. */
  app: string | null;
}

export interface FocusActivity {
  kind: "focus";
  id: string;
  priority: number;
  active: boolean;
}

export type Activity =
  | NotificationActivity
  | MediaActivity
  | VolumeActivity
  | BatteryActivity
  | PrivacyActivity
  | FocusActivity;

/** Short system-status activities rendered by StatusHud. */
export type StatusActivity = BatteryActivity | PrivacyActivity | FocusActivity;

export const isStatusActivity = (a: Activity | null): a is StatusActivity =>
  a !== null && (a.kind === "battery" || a.kind === "privacy" || a.kind === "focus");

export type ActivityKind = Activity["kind"];
