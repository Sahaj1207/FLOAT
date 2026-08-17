export interface MediaSession {
  id: string;
  hasMedia: boolean;
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  source?: string;           // e.g., "Spotify", "Chrome"
  albumArtBase64?: string;   // Image data as base64 string
  
  // Progress/position (in seconds)
  position?: number;
  duration?: number;

  // Controls availability
  canPlayPause: boolean;
  canGoNext: boolean;
  canGoPrev: boolean;
  canSeek?: boolean;
  lastUpdated?: number;
}

// Retain legacy MediaState alias for backward compatibility
export type MediaState = MediaSession;

export interface MultiSessionState {
  sessions: MediaSession[];
  activeSessionId?: string;
  selectedSessionId?: string;
}

export interface SessionPositionPayload {
  id: string;
  position?: number;
  duration?: number;
}

