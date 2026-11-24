import { describe, expect, it } from "vitest";

import {
  createOpeningRun, fadedVolume, OPENING_END_SECONDS, OPENING_FADE_MS, OPENING_LIMIT_MS, OPENING_POSTER_MS, openingPlan,
  openingWithSound, type OpeningLeave,
} from "./opening";

function clock() {
  let now = 0;
  const timers = new Map<number, { at: number; run(): void }>();
  let next = 0;
  return {
    schedule: (run: () => void, ms: number) => { timers.set(++next, { at: now + ms, run }); return next; },
    cancel: (id: number) => { timers.delete(id); },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now || !timers.has(id)) continue;
        timers.delete(id);
        timer.run();
      }
    },
  };
}

function watch(plan: "video" | "poster") {
  const c = clock();
  const seen: Array<OpeningLeave | "done"> = [];
  const run = createOpeningRun(plan, { fade: (why) => seen.push(why), done: () => seen.push("done"), schedule: c.schedule, cancel: c.cancel });
  return { c, seen, run };
}

describe("the opening video", () => {
  it("plays only when the desktop app claimed this launch, and shows the poster alone with reduced motion", () => {
    expect(openingPlan(false, false)).toBe("none");
    expect(openingPlan(false, true)).toBe("none");
    expect(openingPlan(true, false)).toBe("video");
    expect(openingPlan(true, true)).toBe("poster");
    expect(openingWithSound("video", true)).toBe(true);
    expect(openingWithSound("video", false)).toBe(false);
    expect(openingWithSound("poster", true)).toBe(false);
  });

  it("ends on the logo before the last frames and fades into the app", () => {
    const { c, seen, run } = watch("video");
    run.progress(3);
    expect(seen).toEqual([]);
    run.progress(OPENING_END_SECONDS);
    run.progress(6.5);
    expect(seen).toEqual(["end"]);
    c.advance(OPENING_FADE_MS);
    expect(seen).toEqual(["end", "done"]);
  });

  it("is skipped by a click or a key, once", () => {
    const { c, seen, run } = watch("video");
    run.finish("skip");
    run.finish("skip");
    run.progress(OPENING_END_SECONDS);
    c.advance(OPENING_FADE_MS);
    expect(seen).toEqual(["skip", "done"]);
    c.advance(OPENING_LIMIT_MS);
    expect(seen).toEqual(["skip", "done"]);
  });

  it("never holds the app longer than its limit, and lets the app in at once when the video fails", () => {
    const stalled = watch("video");
    stalled.c.advance(OPENING_LIMIT_MS - 1);
    expect(stalled.seen).toEqual([]);
    stalled.c.advance(1);
    stalled.c.advance(OPENING_FADE_MS);
    expect(stalled.seen).toEqual(["end", "done"]);
    const failed = watch("video");
    failed.run.fail();
    expect(failed.seen).toEqual(["done"]);
    failed.c.advance(OPENING_LIMIT_MS);
    expect(failed.seen).toEqual(["done"]);
  });

  it("shows the poster briefly with reduced motion", () => {
    const { c, seen } = watch("poster");
    c.advance(OPENING_POSTER_MS);
    c.advance(OPENING_FADE_MS);
    expect(seen).toEqual(["end", "done"]);
  });

  it("fades the sound to silence", () => {
    expect(fadedVolume(0.6, 0, 150)).toBeCloseTo(0.6);
    expect(fadedVolume(0.6, 75, 150)).toBeCloseTo(0.3);
    expect(fadedVolume(0.6, 200, 150)).toBe(0);
  });
});
