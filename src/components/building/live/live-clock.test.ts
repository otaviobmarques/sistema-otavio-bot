import { describe, expect, it } from "vitest";
import { LiveClock, MAX_FRAME_S, motionPlan } from "./live-clock";

describe("the live clock", () => {
  it("moves with the frames it is given", () => {
    const clock = new LiveClock();
    clock.tick(1000);
    clock.tick(1050);
    expect(clock.t).toBeCloseTo(0.05);
  });

  it("stops while the window is hidden and picks up where it was, without jumping over the gap", () => {
    const clock = new LiveClock();
    clock.tick(0);
    clock.tick(50);
    clock.setRunning(false);
    expect(clock.tick(60_000)).toBeCloseTo(0.05);
    clock.setRunning(true);
    clock.tick(120_000);
    clock.tick(120_050);
    expect(clock.t).toBeCloseTo(0.1);
  });

  it("caps one frame's step, so a stalled tab does not teleport the bots", () => {
    const clock = new LiveClock();
    clock.tick(0);
    clock.tick(5_000);
    expect(clock.t).toBeCloseTo(MAX_FRAME_S);
  });

  it("takes whole steps from the reduced-motion timer, and none while stopped", () => {
    const clock = new LiveClock();
    expect(clock.step(1)).toBe(1);
    clock.setRunning(false);
    expect(clock.step(1)).toBe(1);
  });
});

describe("what the live view runs", () => {
  it("animates every frame for a visible window", () => {
    expect(motionPlan({ visible: true, reducedMotion: false })).toEqual({ frames: true, walk: true, tickMs: null });
  });

  it("holds still under reduced motion: no walking, a coarse timer only to expire balloons", () => {
    expect(motionPlan({ visible: true, reducedMotion: true })).toEqual({ frames: false, walk: false, tickMs: 1000 });
  });

  it("runs nothing at all while the window is hidden", () => {
    expect(motionPlan({ visible: false, reducedMotion: false })).toEqual({ frames: false, walk: false, tickMs: null });
    expect(motionPlan({ visible: false, reducedMotion: true })).toEqual({ frames: false, walk: false, tickMs: null });
  });
});
