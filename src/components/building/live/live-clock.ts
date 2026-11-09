/** The longest step one frame may take: a slow frame moves the bots by this much at most. */
export const MAX_FRAME_S = 0.25;

/** The live Building's time in seconds. It runs only while someone can see it: a hidden window stops it where it was,
 * so nothing walks unseen and nothing jumps when the window comes back. */
export class LiveClock {
  t = 0;
  private last: number | null = null;
  private running = true;

  get isRunning(): boolean {
    return this.running;
  }

  tick(nowMs: number): number {
    if (!this.running) return this.t;
    if (this.last !== null) this.t += Math.min(MAX_FRAME_S, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    return this.t;
  }

  /** Coarse ticks (once a second under reduced motion) move the clock by their whole gap. */
  step(seconds: number): number {
    if (this.running) this.t += seconds;
    this.last = null;
    return this.t;
  }

  setRunning(on: boolean): void {
    this.running = on;
    this.last = null;
  }
}

export interface MotionPlan {
  /** Frames are drawn every animation frame. */
  frames: boolean;
  /** Bots walk to each other; without it a talk is a balloon at the desk. */
  walk: boolean;
  /** The interval of the coarse timer that expires balloons when frames are off; null for none at all. */
  tickMs: number | null;
}

/** What the live view does for a window that is or is not visible, and a person who asked for less motion. */
export function motionPlan({ visible, reducedMotion }: { visible: boolean; reducedMotion: boolean }): MotionPlan {
  if (!visible) return { frames: false, walk: false, tickMs: null };
  if (reducedMotion) return { frames: false, walk: false, tickMs: 1000 };
  return { frames: true, walk: true, tickMs: null };
}
