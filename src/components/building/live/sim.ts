import type { LiveLayout } from "./live-model";

export interface Vec {
  x: number;
  z: number;
}

export const FLOOR_W = 18;
export const FLOOR_D = 11;

export const ELEV = { x0: 1.2, x1: 3.0, door: { x: 2.1, z: 0.95 }, inside: { x: 2.1, z: -0.55 } };
export const COFFEE = { x: 9.4, z: 1.35 };
export const MEETING = { x0: 12.6, x1: 17.6, z0: 0.4, z1: 5.4, table: { x: 15.1, z: 2.8 }, door: { x: 12.6, z: 3.7 } };
export const BOARD = { table: { x: 10.2, z: 5.0 }, radius: 2.05 };
export const LOBBY = { counter: { x: 7.2, z: 3.2 }, sofa: { x: 11.2, z: 3.0 } };

const MAIN_Z = 4.75;
const ZONE2_AISLE = 6.75;
const BACK_AISLE = 8.1;
const PENT_AISLE = 1.6;
const JUNCTION_X = 12.25;
const DESK_GAP = 1.6;

export interface Zone {
  x0: number;
  x1: number;
  cx: number;
  deskZ: number;
  seatZ: number;
  aisle: number;
}

const FRONT_ZONES: Zone[] = [
  { x0: 3.6, x1: 7.9, cx: 5.75, deskZ: 6.75, seatZ: 6.0, aisle: MAIN_Z },
  { x0: 8.3, x1: 12.0, cx: 10.15, deskZ: 6.75, seatZ: 6.0, aisle: MAIN_Z },
  { x0: 12.7, x1: 17.6, cx: 15.15, deskZ: 8.75, seatZ: 8.0, aisle: ZONE2_AISLE },
];

/** Where a floor's rooms sit: the first three as in the portal's floors, any more in a row of their own behind the first two. */
export function zonesFor(count: number): Zone[] {
  if (count <= FRONT_ZONES.length) return FRONT_ZONES.slice(0, Math.max(0, count));
  const extra = count - FRONT_ZONES.length;
  const width = (12.0 - 3.6) / extra;
  return [...FRONT_ZONES, ...Array.from({ length: extra }, (_, index) => {
    const x0 = 3.6 + index * width + 0.1;
    const x1 = 3.6 + (index + 1) * width - 0.1;
    return { x0, x1, cx: (x0 + x1) / 2, deskZ: 9.75, seatZ: 9.0, aisle: BACK_AISLE };
  })];
}

const SEAT_ANGLES = [Math.PI * 1.38, Math.PI * 0.62, Math.PI * 1.72, Math.PI * 0.28, Math.PI];
export const YOU_ANGLE = 0;

function seatAngle(index: number, count: number): number {
  if (count <= SEAT_ANGLES.length) return SEAT_ANGLES[index]!;
  return Math.PI * 0.22 + (index / (count - 1)) * Math.PI * 1.56;
}

export function seatAt(angle: number) {
  const r = BOARD.radius + 0.55;
  const x = BOARD.table.x + Math.sin(angle) * r;
  const z = BOARD.table.z + Math.cos(angle) * r;
  return { x, z, facing: Math.atan2(BOARD.table.x - x, BOARD.table.z - z), angle };
}

/** The board table's chairs: one per bot at the board, at least five, and the person's own. */
export function boardChairs(count: number) {
  const chairs = Math.max(SEAT_ANGLES.length, count);
  return Array.from({ length: chairs }, (_, index) => seatAt(seatAngle(index, chairs)));
}

export interface Home {
  level: number;
  x: number;
  z: number;
  facing: number;
  zone: number;
  /** The walkway in front of its room; the penthouse's own walkway at the board. */
  aisle: number;
  /** Penthouse seats only: the angle of the chair round the table. */
  angle?: number;
}

function deskXs(zone: Zone, count: number): number[] {
  const n = Math.max(1, count);
  const gap = n > 1 ? Math.min(DESK_GAP, (zone.x1 - zone.x0 - 0.9) / (n - 1)) : 0;
  return Array.from({ length: n }, (_, index) => zone.cx + (index - (n - 1) / 2) * gap);
}

export function computeHomes(layout: LiveLayout): Map<string, Home> {
  const homes = new Map<string, Home>();
  for (const level of layout.levels) {
    const here = layout.bots.filter((bot) => bot.level === level.level);
    if (level.kind === "penthouse") {
      const chairs = boardChairs(here.length);
      here.forEach((bot, index) => {
        const seat = chairs[index]!;
        homes.set(bot.id, { level: level.level, x: seat.x, z: seat.z, facing: seat.facing, zone: -1, aisle: PENT_AISLE, angle: seat.angle });
      });
      continue;
    }
    const zones = zonesFor(level.rooms.length);
    zones.forEach((zone, zi) => {
      const room = here.filter((bot) => bot.room === zi);
      const xs = deskXs(zone, room.length);
      room.forEach((bot, index) => homes.set(bot.id, { level: level.level, x: xs[index]!, z: zone.seatZ, facing: 0, zone: zi, aisle: zone.aisle }));
    });
  }
  return homes;
}

export interface DeskGroup {
  name: string;
  zone: Zone;
  desks: Array<{ x: number; z: number; botId?: string }>;
}

/** A level's rooms with their desks: one desk per bot, and one empty desk in an empty room. */
export function desksOf(layout: LiveLayout, levelIndex: number): DeskGroup[] {
  const level = layout.levels[levelIndex];
  if (!level || level.kind !== "office") return [];
  const zones = zonesFor(level.rooms.length);
  return level.rooms.map((name, zi) => {
    const zone = zones[zi]!;
    const room = layout.bots.filter((bot) => bot.level === level.level && bot.room === zi);
    const xs = deskXs(zone, room.length);
    return { name, zone, desks: xs.map((x, index) => ({ x, z: zone.deskZ, botId: room[index]?.id })) };
  });
}

type Spot = { pos: Vec; facing: number; access: Vec[] };

function homeAccess(home: Home): Vec[] {
  if (home.zone >= 0) return [{ x: home.x, z: home.aisle }];
  const angle = home.angle ?? 0;
  const out = { x: BOARD.table.x + Math.sin(angle) * 3.6, z: BOARD.table.z + Math.cos(angle) * 3.6 };
  if (out.z <= BOARD.table.z) return [out, { x: out.x, z: PENT_AISLE }];
  const side = out.x < BOARD.table.x ? BOARD.table.x - 3.9 : BOARD.table.x + 3.9;
  return [out, { x: side, z: out.z }, { x: side, z: PENT_AISLE }];
}

function homeSpot(home: Home): Spot {
  return { pos: { x: home.x, z: home.z }, facing: home.facing, access: homeAccess(home) };
}

/** Where a visitor stands to talk to the bot at this home: beside its chair at a desk, behind it at the board. */
function visitSpot(home: Home): Spot {
  if (home.zone >= 0) {
    const x = home.x + 0.95;
    return { pos: { x, z: home.z + 0.05 }, facing: -Math.PI / 2, access: [{ x, z: home.aisle }] };
  }
  const access = homeAccess(home);
  const pos = access[0]!;
  return { pos, facing: Math.atan2(home.x - pos.x, home.z - pos.z), access: access.slice(1) };
}

function elevatorSpot(penthouse: boolean): Spot {
  return { pos: ELEV.door, facing: Math.PI, access: [{ x: ELEV.door.x, z: penthouse ? PENT_AISLE : MAIN_Z }] };
}

function route(a: Spot, b: Spot): Vec[] {
  const pts: Vec[] = [a.pos, ...a.access];
  const lastA = pts[pts.length - 1]!;
  const inB = [...b.access].reverse();
  const firstB = inB[0] ?? b.pos;
  if (Math.abs(lastA.z - firstB.z) > 0.01 && a.access.length > 0 && b.access.length > 0) pts.push({ x: JUNCTION_X, z: lastA.z }, { x: JUNCTION_X, z: firstB.z });
  pts.push(...inB, b.pos);
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z) > 0.01);
}

export type Mode = "seated" | "walking" | "standing" | "riding";

export interface Seg {
  bot: string;
  t0: number;
  t1: number;
  level: number;
  kind: "walk" | "stand" | "ride";
  path?: Vec[];
  lens?: number[];
  total?: number;
  pos?: Vec;
  facing?: number;
  bubble?: string;
  bubbleFor?: number;
  carDoor?: boolean;
}

export interface Say {
  bot: string;
  t0: number;
  t1: number;
  text: string;
}

export interface CarMove {
  t0: number;
  t1: number;
  from: number;
  to: number;
}

/** What the Building shows moving: where everyone sits, the trips under way, the balloons and the lift's journeys. Times
 * are seconds on the live clock. */
export interface World {
  homes: Map<string, Home>;
  penthouse: number;
  segs: Seg[];
  says: Say[];
  car: CarMove[];
  /** The lift's level before its first journey still listed. */
  carStart: number;
  /** The lift is free from this time, at `carAt`. */
  carFreeAt: number;
  carAt: number;
}

export function createWorld(layout: LiveLayout): World {
  return { homes: computeHomes(layout), penthouse: layout.penthouse, segs: [], says: [], car: [], carStart: 0, carFreeAt: 0, carAt: 0 };
}

const sameHome = (a: Home | undefined, b: Home | undefined) => Boolean(a && b && a.level === b.level && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01);

/** Seats everyone for a new layout. A bot whose seat moved drops the trip it was on: it reappears at its new desk. */
export function reseat(world: World, layout: LiveLayout): World {
  const homes = computeHomes(layout);
  const kept = (bot: string) => sameHome(world.homes.get(bot), homes.get(bot));
  return { ...world, homes, penthouse: layout.penthouse, segs: world.segs.filter((seg) => kept(seg.bot)), says: world.says.filter((say) => kept(say.bot)) };
}

export const SPEED = 1.35;
export const FLOOR_TIME = 1.7;
export const DWELL = 0.7;
const WALK_BUBBLE = 2.5;

class Trip {
  t: number;
  pos: Vec;
  level: number;
  constructor(private w: World, readonly bot: string, start: number, home: Home) {
    this.t = start;
    this.pos = { x: home.x, z: home.z };
    this.level = home.level;
  }

  walk(path: Vec[], opts: { bubble?: string | null; carDoor?: boolean } = {}) {
    const lens: number[] = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z));
    const total = lens[lens.length - 1]!;
    const dur = Math.max(0.6, total / SPEED);
    this.w.segs.push({
      bot: this.bot, t0: this.t, t1: this.t + dur, level: this.level, kind: "walk", path, lens, total,
      ...(opts.bubble ? { bubble: opts.bubble, bubbleFor: WALK_BUBBLE } : {}), ...(opts.carDoor ? { carDoor: true } : {}),
    });
    this.t += dur;
    this.pos = path[path.length - 1]!;
    return this;
  }

  stand(dur: number, facing: number) {
    if (dur <= 0.01) return this;
    this.w.segs.push({ bot: this.bot, t0: this.t, t1: this.t + dur, level: this.level, kind: "stand", pos: this.pos, facing });
    this.t += dur;
    return this;
  }

  say(from: number, to: number, text: string | null) {
    if (text) this.w.says.push({ bot: this.bot, t0: this.t + from, t1: this.t + to, text });
    return this;
  }

  /** Waits for the lift (calling it up or down first), rides it to `to` and steps out. */
  ride(to: number) {
    const w = this.w;
    const arrive = this.t;
    let ready = Math.max(arrive, w.carFreeAt);
    if (w.carAt !== this.level) {
      const travel = Math.abs(w.carAt - this.level) * FLOOR_TIME;
      w.car.push({ t0: ready, t1: ready + travel, from: w.carAt, to: this.level });
      ready += travel;
    }
    this.stand(ready - arrive, Math.PI);
    this.walk([ELEV.door, ELEV.inside], { carDoor: true });
    const travel = Math.abs(to - this.level) * FLOOR_TIME;
    const dur = DWELL + travel + DWELL;
    w.segs.push({ bot: this.bot, t0: this.t, t1: this.t + dur, level: this.level, kind: "ride" });
    w.car.push({ t0: this.t + DWELL, t1: this.t + DWELL + travel, from: this.level, to });
    this.t += dur;
    this.level = to;
    this.walk([ELEV.inside, ELEV.door], { carDoor: true });
    w.carAt = to;
    w.carFreeAt = this.t;
    return this;
  }
}

export interface VisitWords {
  /** The balloon on the way: who it is going to see. */
  walking: string | null;
  /** The balloon while it talks: what the conversation is about, when the event said. */
  topic: string | null;
}

export const TALK_WITH_TOPIC = 5.5;
export const TALK_WITHOUT_TOPIC = 3.2;

/** The last time a bot is still on a trip, or 0 when it sits at its desk. */
export function busyUntil(w: World, bot: string): number {
  let until = 0;
  for (const seg of w.segs) if (seg.bot === bot && seg.t1 > until) until = seg.t1;
  return until;
}

/** Sends `from` to `to`'s desk (taking the lift when it is on another level), shows what it says there and brings it
 * back. False when either bot has no seat or `from` is already out. */
export function planVisit(w: World, from: string, to: string, now: number, words: VisitWords): boolean {
  const start = w.homes.get(from);
  const target = w.homes.get(to);
  if (!start || !target || from === to || busyUntil(w, from) > now) return false;
  const trip = new Trip(w, from, now, start);
  const back = homeSpot(start);
  const visit = visitSpot(target);
  const talk = words.topic ? TALK_WITH_TOPIC : TALK_WITHOUT_TOPIC;
  if (start.level === target.level) {
    trip.walk(route(back, visit), { bubble: words.walking });
    trip.say(0.2, talk - 0.2, words.topic).stand(talk, visit.facing);
    trip.walk(route(visit, back));
    return true;
  }
  const lift = (level: number) => elevatorSpot(level === w.penthouse);
  trip.walk(route(back, lift(start.level)), { bubble: words.walking });
  trip.ride(target.level);
  trip.walk(route(lift(target.level), visit));
  trip.say(0.2, talk - 0.2, words.topic).stand(talk, visit.facing);
  trip.walk(route(visit, lift(target.level)));
  trip.ride(start.level);
  trip.walk(route(lift(start.level), back));
  return true;
}

/** The still version of a visit, for reduced motion: a balloon at the bot's own desk and none of the walk. */
export function planGlance(w: World, from: string, now: number, text: string | null): boolean {
  if (!w.homes.has(from) || !text) return false;
  w.says.push({ bot: from, t0: now, t1: now + TALK_WITH_TOPIC, text });
  return true;
}

/** Forgets what has finished, so the lists stay short however long the view stays open. */
export function prune(w: World, now: number): void {
  w.segs = w.segs.filter((seg) => seg.t1 > now - 0.5);
  w.says = w.says.filter((say) => say.t1 > now);
  while (w.car.length > 0 && w.car[0]!.t1 < now) w.carStart = w.car.shift()!.to;
}

export function carLevel(w: World, t: number): number {
  let y = w.carStart;
  for (const mv of w.car) {
    if (t < mv.t0) break;
    if (t <= mv.t1) {
      const p = (t - mv.t0) / Math.max(0.001, mv.t1 - mv.t0);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      return mv.from + (mv.to - mv.from) * e;
    }
    y = mv.to;
  }
  return y;
}

/** Going up, going down, or 0 when the lift stands. */
export function carDirection(w: World, t: number): number {
  const mv = w.car.find((m) => t >= m.t0 && t <= m.t1);
  return mv ? Math.sign(mv.to - mv.from) : 0;
}

/** How far open the lift doors on `level` are, 0 to 1. */
export function doorOpen(w: World, level: number, t: number): number {
  if (Math.abs(carLevel(w, t) - level) > 0.02) return 0;
  const ramp = (a: number, b: number) => {
    if (t < a - 0.35 || t > b + 0.35) return 0;
    if (t < a) return 1 - (a - t) / 0.35;
    if (t > b) return 1 - (t - b) / 0.35;
    return 1;
  };
  let open = 0;
  for (const s of w.segs) if (s.kind === "walk" && s.carDoor && s.level === level) open = Math.max(open, ramp(s.t0 - 0.6, s.t1 + 0.15));
  return open;
}

export interface Pose {
  level: number;
  levelY: number;
  x: number;
  z: number;
  facing: number;
  mode: Mode;
  stride: number;
}

export function poseAt(w: World, botId: string, t: number): Pose | undefined {
  const home = w.homes.get(botId);
  if (!home) return undefined;
  const s = w.segs.find((x) => x.bot === botId && t >= x.t0 && t < x.t1);
  if (!s) return { level: home.level, levelY: home.level, x: home.x, z: home.z, facing: home.facing, mode: "seated", stride: 0 };
  if (s.kind === "stand") return { level: s.level, levelY: s.level, x: s.pos!.x, z: s.pos!.z, facing: s.facing ?? 0, mode: "standing", stride: 0 };
  if (s.kind === "ride") {
    const cy = carLevel(w, t);
    return { level: Math.round(cy), levelY: cy, x: ELEV.inside.x, z: ELEV.inside.z, facing: 0, mode: "riding", stride: 0 };
  }
  const p = Math.min(1, (t - s.t0) / (s.t1 - s.t0));
  const d = p * s.total!;
  const lens = s.lens!;
  const path = s.path!;
  let i = 1;
  while (i < lens.length - 1 && lens[i]! < d) i++;
  const a = path[i - 1]!;
  const b = path[i]!;
  const segLen = lens[i]! - lens[i - 1]!;
  const q = segLen > 0 ? (d - lens[i - 1]!) / segLen : 1;
  return { level: s.level, levelY: s.level, x: a.x + (b.x - a.x) * q, z: a.z + (b.z - a.z) * q, facing: Math.atan2(b.x - a.x, b.z - a.z), mode: "walking", stride: d * 3.2 };
}

/** What each bot is saying right now: a conversation's words first, then a walk's own balloon. */
export function bubblesAt(w: World, t: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of w.says) if (t >= s.t0 && t < s.t1) out.set(s.bot, s.text);
  for (const s of w.segs) {
    if (s.bubble && t >= s.t0 && t < s.t0 + (s.bubbleFor ?? s.t1 - s.t0) && !out.has(s.bot)) out.set(s.bot, s.bubble);
  }
  return out;
}
