export class MediaTimelineManager {
  private basePosition = 0;
  private syncTimestamp = performance.now();
  private isPlaying = false;
  private duration = 0;
  
  private isSeeking = false;
  private seekPos: number | null = null;
  
  private currentSessionId: string | undefined = undefined;
  private currentTitle: string | undefined = undefined;

  private fills = new Set<HTMLElement>();
  private labels = new Set<HTMLElement>();
  private lastRenderedSec = -1;
  private animFrameId: number | null = null;

  public sync(
    sessionId: string | undefined,
    title: string | undefined,
    position: number,
    duration: number,
    isPlaying: boolean
  ) {
    console.log(`[MEDIA TIMELINE] session=${sessionId || "none"} position=${position} duration=${duration}`);

    const isSessionChange = this.currentSessionId !== sessionId;
    const isTrackChange = !isSessionChange && this.currentTitle !== title;

    if (isSessionChange) {
      console.log(`[MEDIA TIMELINE] session-change: ${this.currentSessionId || "none"} -> ${sessionId || "none"}`);
      this.currentSessionId = sessionId;
      this.currentTitle = title;
      this.basePosition = position;
      this.syncTimestamp = performance.now();
      this.isPlaying = isPlaying;
      this.duration = duration;
      this.lastRenderedSec = -1;
      this.isSeeking = false;
      this.seekPos = null;

      // Immediate synchronous render for the new session snapshot
      this.updateFills();
      this.updateLabels();
    } else if (isTrackChange) {
      console.log(`[MEDIA TIMELINE] track-change: "${this.currentTitle || ""}" -> "${title || ""}"`);
      this.currentTitle = title;
      this.basePosition = position;
      this.syncTimestamp = performance.now();
      this.isPlaying = isPlaying;
      this.duration = duration;
      this.lastRenderedSec = -1;
      this.isSeeking = false;
      this.seekPos = null;

      // Immediate synchronous render for new track metadata
      this.updateFills();
      this.updateLabels();
    } else {
      // Periodic resync from GSMTC updates (only sync if not currently seeking)
      if (!this.isSeeking) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying !== isPlaying) {
          if (isPlaying) {
            console.log(`[MEDIA TIMELINE] resume`);
          } else {
            console.log(`[MEDIA TIMELINE] pause`);
          }
        }

        // Always log a sync message if position or playing state changed significantly
        if (Math.abs(this.basePosition - position) > 0.5 || wasPlaying !== isPlaying) {
          console.log(`[MEDIA TIMELINE] sync position=${position} isPlaying=${isPlaying}`);
        }

        this.basePosition = position;
        this.syncTimestamp = performance.now();
        this.isPlaying = isPlaying;
        this.duration = duration;

        this.updateFills();
        this.updateLabels();
      }
    }

    this.checkStateAndStartStopRAF();
  }

  public getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  public setSeeking(isSeeking: boolean, seekPos: number | null) {
    if (isSeeking && !this.isSeeking) {
      console.log(`[MEDIA SEEK] start`);
    }
    this.isSeeking = isSeeking;
    this.seekPos = seekPos;

    // During seek, visually update elements immediately to match pointer location
    if (isSeeking && seekPos !== null) {
      this.updateFills();
      this.updateLabels();
    }

    this.checkStateAndStartStopRAF();
  }

  public commitSeek(position: number) {
    console.log(`[MEDIA SEEK] commit position=${position}`);
    this.basePosition = position;
    this.syncTimestamp = performance.now();
    this.isSeeking = false;
    this.seekPos = null;
    this.updateFills();
    this.updateLabels();
    this.checkStateAndStartStopRAF();
  }

  public registerFill(el: HTMLElement) {
    this.fills.add(el);
    this.updateFills();
    this.checkStateAndStartStopRAF();
  }

  public unregisterFill(el: HTMLElement) {
    this.fills.delete(el);
    this.checkStateAndStartStopRAF();
  }

  public registerLabel(el: HTMLElement) {
    this.labels.add(el);
    this.updateLabels();
    this.checkStateAndStartStopRAF();
  }

  public unregisterLabel(el: HTMLElement) {
    this.labels.delete(el);
    this.checkStateAndStartStopRAF();
  }

  public getCurrentPosition(): number {
    if (this.isSeeking && this.seekPos !== null) {
      return this.seekPos;
    }
    let current = this.basePosition;
    if (this.isPlaying && this.duration > 0) {
      const elapsed = (performance.now() - this.syncTimestamp) / 1000;
      current = Math.min(this.duration, Math.max(0, this.basePosition + elapsed));
    }
    return current;
  }

  private checkStateAndStartStopRAF() {
    const hasConsumers = this.fills.size > 0 || this.labels.size > 0;
    const shouldRun = this.isPlaying && this.duration > 0 && hasConsumers && !this.isSeeking;

    if (shouldRun && !this.animFrameId) {
      this.startRAF();
    } else if (!shouldRun && this.animFrameId) {
      this.stop();
    }
  }

  private startRAF() {
    console.log("[MEDIA TIMELINE] RAF started");
    const loop = () => {
      this.updateFills();
      this.updateLabels();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
      console.log("[MEDIA TIMELINE] RAF stopped");
    }
    // Final static render to lock visual positions exactly on pause/stop values
    this.updateFills();
    this.updateLabels();
  }

  private formatTime(seconds?: number): string {
    if (seconds === undefined || isNaN(seconds) || seconds < 0) return "--:--";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private updateFills() {
    const pos = this.getCurrentPosition();
    const pct = this.duration > 0 ? Math.min(100, Math.max(0, (pos / this.duration) * 100)) : 0;
    for (const fill of this.fills) {
      if (fill.isConnected) {
        fill.style.width = `${pct}%`;
      } else {
        this.fills.delete(fill);
      }
    }
  }

  private updateLabels() {
    const pos = this.getCurrentPosition();
    const sec = Math.floor(pos);
    if (sec !== this.lastRenderedSec) {
      this.lastRenderedSec = sec;
      const formatted = this.formatTime(pos);
      for (const label of this.labels) {
        if (label.isConnected) {
          label.textContent = formatted;
        } else {
          this.labels.delete(label);
        }
      }
    }
  }
}

export const mediaTimeline = new MediaTimelineManager();
