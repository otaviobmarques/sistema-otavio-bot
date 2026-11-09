import { describe, expect, it } from "vitest";
import type { LiveBot, LiveLayout, LiveLevel } from "./live-model";
import {
  ELEV, TALK_WITH_TOPIC, bubblesAt, busyUntil, carLevel, createWorld, doorOpen, planGlance, planVisit, poseAt, prune, reseat, type World,
} from "./sim";

const level = (n: number, kind: LiveLevel["kind"], rooms: string[] = []): LiveLevel => ({ level: n, kind, companyId: null, name: `L${n}`, sub: "", accent: "#3b82f6", face: "#93c5fd", rooms });

const liveBot = (id: string, at: number, room: number): LiveBot => ({
  id, name: id, role: "", status: "idle", line: null, look: { head: "round", eyes: "dots", accessory: "none" },
  palette: { bg: "#000000", face: "#ffffff", accent: "#ff0000" }, outfit: { top: "tee", color: "#ffffff" }, level: at, room,
});

const layout = (bots: LiveBot[]): LiveLayout => ({
  levels: [level(0, "lobby"), level(1, "office", ["Comercial"]), level(2, "office", ["Criação", "Mídia"]), level(3, "penthouse")],
  penthouse: 3,
  bots,
});

const office = layout([liveBot("duda", 2, 0), liveBot("rui", 2, 1), liveBot("bia", 1, 0), liveBot("chief", 3, -1)]);

function sample(w: World, bot: string, from: number, to: number, step = 0.1) {
  const out: Array<{ t: number; mode: string; level: number }> = [];
  for (let t = from; t <= to; t += step) {
    const pose = poseAt(w, bot, t)!;
    out.push({ t, mode: pose.mode, level: pose.level });
  }
  return out;
}

describe("a visit on the same floor", () => {
  it("walks to the teammate's desk, says the topic there and walks back to sit down", () => {
    const w = createWorld(office);
    expect(poseAt(w, "duda", 0)).toMatchObject({ mode: "seated", level: 2 });
    expect(planVisit(w, "duda", "rui", 10, { walking: "Going to see rui", topic: "The new banner" })).toBe(true);
    const end = busyUntil(w, "duda");
    expect(end).toBeGreaterThan(10 + TALK_WITH_TOPIC);
    const modes = sample(w, "duda", 10, end + 0.5).map((s) => s.mode);
    expect(modes[0]).toBe("walking");
    expect(modes).toContain("standing");
    expect(modes.at(-1)).toBe("seated");
    expect(modes).not.toContain("riding");
    expect(w.car).toEqual([]);
    const standing = w.segs.find((seg) => seg.kind === "stand")!;
    expect(bubblesAt(w, standing.t0 + 1).get("duda")).toBe("The new banner");
    expect(bubblesAt(w, 10.5).get("duda")).toBe("Going to see rui");
    const stop = standing.pos!;
    const rui = w.homes.get("rui")!;
    expect(Math.hypot(stop.x - rui.x, stop.z - rui.z)).toBeLessThan(1.2);
  });

  it("refuses a second trip for a bot that is still out, and one with no seat", () => {
    const w = createWorld(office);
    planVisit(w, "duda", "rui", 0, { walking: null, topic: null });
    expect(planVisit(w, "duda", "bia", 1, { walking: null, topic: null })).toBe(false);
    expect(planVisit(w, "ghost", "rui", 1, { walking: null, topic: null })).toBe(false);
    expect(planVisit(w, "rui", "rui", 1, { walking: null, topic: null })).toBe(false);
  });

  it("shows no words of its own when the event had none", () => {
    const w = createWorld(office);
    planVisit(w, "duda", "rui", 0, { walking: null, topic: null });
    expect(w.says).toEqual([]);
    expect(w.segs.some((seg) => seg.bubble)).toBe(false);
  });
});

describe("a visit to another floor", () => {
  it("calls the lift, rides it to the teammate's floor, and back again", () => {
    const w = createWorld(office);
    planVisit(w, "bia", "duda", 0, { walking: "Going to see duda", topic: "A video for Friday" });
    const end = busyUntil(w, "bia");
    const samples = sample(w, "bia", 0, end + 0.5);
    const riding = samples.filter((s) => s.mode === "riding");
    expect(riding.length).toBeGreaterThan(0);
    expect(samples.some((s) => s.mode === "standing" && s.level === 2), "talks on the teammate's floor").toBe(true);
    expect(samples.at(-1)).toMatchObject({ mode: "seated", level: 1 });
    expect(w.car.map((move) => [move.from, move.to])).toEqual([[0, 1], [1, 2], [2, 1]]);
    const up = w.car[1]!;
    expect(carLevel(w, (up.t0 + up.t1) / 2)).toBeGreaterThan(1);
    expect(carLevel(w, (up.t0 + up.t1) / 2)).toBeLessThan(2);
    const pose = poseAt(w, "bia", (up.t0 + up.t1) / 2)!;
    expect(pose).toMatchObject({ mode: "riding", x: ELEV.inside.x });
    const boarding = w.segs.find((seg) => seg.carDoor && seg.level === 1)!;
    expect(doorOpen(w, 1, (boarding.t0 + boarding.t1) / 2)).toBe(1);
    expect(doorOpen(w, 2, (boarding.t0 + boarding.t1) / 2), "the doors open only where the car is").toBe(0);
  });

  it("makes a second rider wait for the lift instead of sharing a journey", () => {
    const w = createWorld(office);
    planVisit(w, "bia", "duda", 0, { walking: null, topic: null });
    const firstFree = w.carFreeAt;
    planVisit(w, "rui", "bia", 1, { walking: null, topic: null });
    const moves = w.car;
    for (let i = 1; i < moves.length; i++) expect(moves[i]!.t0).toBeGreaterThanOrEqual(moves[i - 1]!.t1 - 1e-9);
    expect(moves.filter((move) => move.t0 >= firstFree).length).toBeGreaterThan(0);
    const waits = w.segs.filter((seg) => seg.bot === "rui" && seg.kind === "stand");
    expect(waits.length, "rui stands at the lift door before boarding, then talks").toBeGreaterThanOrEqual(2);
  });

  it("walks a board member from the penthouse table to a desk and back", () => {
    const w = createWorld(office);
    expect(planVisit(w, "chief", "bia", 0, { walking: null, topic: "Status?" })).toBe(true);
    const samples = sample(w, "chief", 0, busyUntil(w, "chief") + 0.5);
    expect(samples.some((s) => s.mode === "standing" && s.level === 1)).toBe(true);
    expect(samples.at(-1)).toMatchObject({ mode: "seated", level: 3 });
  });
});

describe("keeping the world small and current", () => {
  it("forgets finished trips and lift journeys, keeping where the lift stopped", () => {
    const w = createWorld(office);
    planVisit(w, "bia", "duda", 0, { walking: null, topic: "x" });
    const end = busyUntil(w, "bia");
    prune(w, end + 5);
    expect(w.segs).toEqual([]);
    expect(w.says).toEqual([]);
    expect(w.car).toEqual([]);
    expect(w.carStart).toBe(1);
    expect(carLevel(w, end + 6)).toBe(1);
  });

  it("drops the trip of a bot whose seat moved, and seats it at its new desk", () => {
    const w = createWorld(office);
    planVisit(w, "duda", "rui", 0, { walking: null, topic: "x" });
    planVisit(w, "bia", "rui", 0, { walking: null, topic: "y" });
    const moved = layout([liveBot("duda", 1, 0), liveBot("rui", 2, 1), liveBot("bia", 1, 0), liveBot("chief", 3, -1)]);
    const next = reseat(w, moved);
    expect(next.segs.some((seg) => seg.bot === "duda")).toBe(false);
    expect(poseAt(next, "duda", 1)).toMatchObject({ mode: "seated", level: 1 });
  });
});

describe("reduced motion", () => {
  it("shows the talk as a balloon at the bot's own desk, with no walking", () => {
    const w = createWorld(office);
    expect(planGlance(w, "duda", 3, "The new banner")).toBe(true);
    expect(w.segs).toEqual([]);
    expect(poseAt(w, "duda", 4)).toMatchObject({ mode: "seated" });
    expect(bubblesAt(w, 4).get("duda")).toBe("The new banner");
    expect(bubblesAt(w, 3 + TALK_WITH_TOPIC + 0.1).has("duda")).toBe(false);
    expect(planGlance(w, "duda", 3, null)).toBe(false);
  });
});
