import type { Bot, Status } from "../data/mock";
import { companies } from "../data/mock";

export interface Vec {
  x: number;
  z: number;
}

export const FLOOR_W = 18;
export const FLOOR_D = 11;
export const PENTHOUSE = 5;
export const FLOORS = [0, 1, 2, 3, 4, 5];

export const ELEV = { x0: 1.2, x1: 3.0, door: { x: 2.1, z: 0.95 }, inside: { x: 2.1, z: -0.55 } };
export const COFFEE = { x: 9.4, z: 1.35 };
export const MEETING = { x0: 12.6, x1: 17.6, z0: 0.4, z1: 5.4, table: { x: 15.1, z: 2.8 }, door: { x: 12.6, z: 3.7 } };
const MAIN_Z = 4.75;
const JUNCTION_X = 12.25;
const ZONE2_AISLE = 6.75;
const DESK_GAP = 1.6;

export const ZONES = [
  { x0: 3.6, x1: 7.9, cx: 5.75, deskZ: 6.75, seatZ: 6.0, aisle: MAIN_Z },
  { x0: 8.3, x1: 12.0, cx: 10.15, deskZ: 6.75, seatZ: 6.0, aisle: MAIN_Z },
  { x0: 12.7, x1: 17.6, cx: 15.15, deskZ: 8.75, seatZ: 8.0, aisle: ZONE2_AISLE },
];

export const BOARD = { table: { x: 10.2, z: 5.0 }, radius: 2.05 };
const BOARD_SEATS = [
  { id: "tavinho", angle: Math.PI },
  { id: "rafa", angle: Math.PI * 1.38 },
  { id: "vera", angle: Math.PI * 1.72 },
  { id: "voce", angle: 0 },
  { id: "dante", angle: Math.PI * 0.28 },
  { id: "fabio", angle: Math.PI * 0.62 },
];

export function boardSeat(id: string) {
  const s = BOARD_SEATS.find((b) => b.id === id);
  if (!s) return undefined;
  const r = BOARD.radius + 0.55;
  const x = BOARD.table.x + Math.sin(s.angle) * r;
  const z = BOARD.table.z + Math.cos(s.angle) * r;
  const facing = Math.atan2(BOARD.table.x - x, BOARD.table.z - z);
  return { x, z, facing };
}

export const LOBBY = { counter: { x: 7.2, z: 3.2 }, sofa: { x: 11.2, z: 3.0 } };

export interface Home {
  floor: number;
  x: number;
  z: number;
  facing: number;
  seated: boolean;
  zone: number;
  desk?: Vec;
}

export function companyFloor(companyId: string) {
  return companies.find((c) => c.id === companyId)?.floor ?? 0;
}

export function computeHomes(bots: Bot[]): Map<string, Home> {
  const homes = new Map<string, Home>();
  const pending = bots.filter((b) => !b.hired);
  pending.forEach((b, i) => homes.set(b.id, { floor: 0, x: LOBBY.sofa.x - 0.5 + i * 0.9, z: LOBBY.sofa.z + 0.2, facing: 0, seated: true, zone: -1 }));
  for (const b of bots.filter((x) => x.hired)) {
    if (b.id === "tavinho" || b.departmentId === "direcao") {
      const s = boardSeat(b.id) ?? boardSeat("tavinho")!;
      homes.set(b.id, { floor: PENTHOUSE, x: s.x, z: s.z, facing: s.facing, seated: true, zone: -1 });
    }
  }
  for (const co of companies) {
    co.departments.forEach((d, zi) => {
      const zone = ZONES[zi]!;
      const room = bots.filter((b) => b.hired && b.companyId === co.id && b.departmentId === d.id);
      room.forEach((b, i) => {
        const x = zone.cx + (i - (room.length - 1) / 2) * DESK_GAP;
        homes.set(b.id, { floor: co.floor, x, z: zone.seatZ, facing: 0, seated: true, zone: zi, desk: { x, z: zone.deskZ } });
      });
    });
  }
  return homes;
}

export function desksOf(companyId: string, bots: Bot[]) {
  const co = companies.find((c) => c.id === companyId);
  if (!co) return [];
  return co.departments.map((d, zi) => {
    const zone = ZONES[zi]!;
    const room = bots.filter((b) => b.hired && b.companyId === co.id && b.departmentId === d.id);
    const n = Math.max(1, room.length);
    return {
      dept: d,
      zone,
      desks: Array.from({ length: n }, (_, i) => ({ x: zone.cx + (i - (n - 1) / 2) * DESK_GAP, z: zone.deskZ, botId: room[i]?.id })),
    };
  });
}

type Spot = { pos: Vec; access: Vec[] };

function spotOfHome(h: Home): Spot {
  const aisle = h.zone === 2 ? ZONE2_AISLE : MAIN_Z;
  return { pos: { x: h.x, z: h.z }, access: [{ x: h.x, z: aisle }] };
}
function visitSpot(h: Home): Spot & { facing: number } {
  const aisle = h.zone === 2 ? ZONE2_AISLE : MAIN_Z;
  const x = h.x + 0.95;
  return { pos: { x, z: h.z + 0.05 }, access: [{ x, z: aisle }], facing: -Math.PI / 2 };
}
const ELEV_SPOT: Spot = { pos: ELEV.door, access: [{ x: ELEV.door.x, z: MAIN_Z }] };
const COFFEE_SPOT: Spot = { pos: COFFEE, access: [{ x: COFFEE.x, z: MAIN_Z }] };
function meetingSpot(i: number): Spot {
  const a = Math.PI * 1.5 + (i - 0.5) * 0.9;
  const pos = { x: MEETING.table.x + Math.sin(a) * 1.55, z: MEETING.table.z + Math.cos(a) * 1.25 };
  return { pos, access: [{ x: JUNCTION_X, z: MAIN_Z }, { x: JUNCTION_X, z: MEETING.door.z }, { x: MEETING.door.x + 0.9, z: MEETING.door.z }] };
}

function route(a: Spot, b: Spot): Vec[] {
  const pts: Vec[] = [a.pos, ...a.access];
  const lastA = a.access[a.access.length - 1]!;
  const firstB = b.access[0]!;
  const z2 = (p: Vec) => Math.abs(p.z - ZONE2_AISLE) < 0.01;
  if (z2(lastA) !== z2(firstB)) {
    if (z2(lastA)) pts.push({ x: JUNCTION_X, z: ZONE2_AISLE }, { x: JUNCTION_X, z: MAIN_Z });
    else pts.push({ x: JUNCTION_X, z: MAIN_Z }, { x: JUNCTION_X, z: ZONE2_AISLE });
  }
  pts.push(...b.access, b.pos);
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z) > 0.01);
}

export type Mode = "sentado" | "andando" | "parado" | "elevador";

interface Seg {
  bot: string;
  t0: number;
  t1: number;
  floor: number;
  kind: "walk" | "stand" | "ride";
  path?: Vec[];
  lens?: number[];
  total?: number;
  pos?: Vec;
  facing?: number;
  bubble?: string;
  bubbleFor?: number;
  toFloor?: number;
  carDoor?: "entra" | "sai";
}
interface Say {
  bot: string;
  t0: number;
  t1: number;
  text: string;
}
interface CarMove {
  t0: number;
  t1: number;
  from: number;
  to: number;
}
export interface LiveEvent {
  t: number;
  text: string;
}

export interface World {
  cycle: number;
  homes: Map<string, Home>;
  segs: Seg[];
  says: Say[];
  car: CarMove[];
  carStart: number;
  events: LiveEvent[];
  statusOverride: { bot: string; t0: number; t1: number; status: Status }[];
}

const SPEED = 1.35;
const FLOOR_TIME = 1.7;
const DWELL = 0.7;

class Trip {
  t: number;
  pos: Vec;
  floor: number;
  constructor(
    private w: World,
    public bot: string,
    start: number,
    private home: Home,
  ) {
    this.t = start;
    this.pos = { x: home.x, z: home.z };
    this.floor = home.floor;
  }
  walk(path: Vec[], opts: { bubble?: string; bubbleFor?: number; carDoor?: "entra" | "sai"; event?: string } = {}) {
    const lens: number[] = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z));
    const total = lens[lens.length - 1]!;
    const dur = Math.max(0.6, total / SPEED);
    this.w.segs.push({ bot: this.bot, t0: this.t, t1: this.t + dur, floor: this.floor, kind: "walk", path, lens, total, ...opts });
    if (opts.event) this.w.events.push({ t: this.t, text: opts.event });
    this.t += dur;
    this.pos = path[path.length - 1]!;
    return this;
  }
  stand(dur: number, facing: number, bubble?: string, event?: string) {
    this.w.segs.push({ bot: this.bot, t0: this.t, t1: this.t + dur, floor: this.floor, kind: "stand", pos: this.pos, facing, bubble });
    if (event) this.w.events.push({ t: this.t, text: event });
    this.t += dur;
    return this;
  }
  say(bot: string, from: number, to: number, text: string) {
    this.w.says.push({ bot, t0: this.t + from, t1: this.t + to, text });
    return this;
  }
  ride(to: number, event?: string) {
    const travel = Math.abs(to - this.floor) * FLOOR_TIME;
    const dur = DWELL + travel + DWELL;
    this.w.segs.push({ bot: this.bot, t0: this.t, t1: this.t + dur, floor: this.floor, kind: "ride", toFloor: to });
    this.w.car.push({ t0: this.t + DWELL, t1: this.t + DWELL + travel, from: this.floor, to });
    if (event) this.w.events.push({ t: this.t, text: event });
    this.t += dur;
    this.floor = to;
    return this;
  }
  delegate(target: Home, ask: string, reply: string, targetBot: string, events: { leave: string; arrive: string; back: string }) {
    const homeSpot = spotOfHome(this.home);
    this.walk(route(homeSpot, ELEV_SPOT), { event: events.leave, bubble: "Indo ao elevador", bubbleFor: 2.5 });
    this.walk([ELEV.door, ELEV.inside], { carDoor: "entra" });
    this.ride(target.floor);
    this.walk([ELEV.inside, ELEV.door], { carDoor: "sai" });
    const v = visitSpot(target);
    this.walk(route(ELEV_SPOT, v));
    this.say(this.bot, 0.2, 3.6, ask).say(targetBot, 3.8, 7.2, reply);
    this.stand(7.6, v.facing, undefined, events.arrive);
    this.walk(route(v, ELEV_SPOT));
    this.walk([ELEV.door, ELEV.inside], { carDoor: "entra" });
    this.ride(this.home.floor);
    this.walk([ELEV.inside, ELEV.door], { carDoor: "sai" });
    this.walk(route(ELEV_SPOT, homeSpot), { event: events.back });
    return this;
  }
  errand(to: Spot & { facing?: number }, dur: number, bubble: string, event?: string) {
    const homeSpot = spotOfHome(this.home);
    this.walk(route(homeSpot, to), { bubble, bubbleFor: 3 });
    this.stand(dur, to.facing ?? Math.PI, undefined, event);
    this.walk(route(to, homeSpot));
    return this;
  }
}

export function buildWorld(bots: Bot[]): World {
  const homes = computeHomes(bots);
  const w: World = { cycle: 64, homes, segs: [], says: [], car: [], carStart: 4, events: [], statusOverride: [] };
  const h = (id: string) => {
    const b = bots.find((x) => x.id === id && x.hired);
    const home = homes.get(id);
    return b && home && home.floor > 0 && home.floor < PENTHOUSE ? home : undefined;
  };
  const trip = (id: string, start: number) => {
    const home = h(id);
    return home ? new Trip(w, id, start, home) : undefined;
  };

  const noa = h("noa");
  if (noa)
    trip("duda", 1.5)?.delegate(noa, "Noa, preciso de um vídeo de 15s da Academia Pulso para sexta.", "Fechado. Gravo amanhã às 10h.", "noa", {
      leave: "**Duda** (RedBox) saiu para pedir um vídeo à Vertice",
      arrive: "**Duda** pediu à **Noa** um vídeo de 15s da Academia Pulso",
      back: "**Duda** voltou à Criação com o vídeo combinado",
    });
  const lia = h("lia");
  let liaStart = -1;
  if (lia) {
    const t = trip("bia", 33);
    if (t) {
      t.delegate(lia, "Lia, faz o roteiro de um vídeo de demonstração da FoodX?", "Faço. Roteiro pronto até amanhã.", "lia", {
        leave: "**Bia** (FoodX) pegou o elevador para a Vertice",
        arrive: "**Bia** pediu à **Lia** o roteiro de um vídeo da FoodX",
        back: "**Bia** voltou ao Comercial da FoodX",
      });
      liaStart = w.says.find((s) => s.bot === "lia")?.t1 ?? -1;
    }
  }

  const max = h("max");
  if (max) {
    const t = trip("rui", 11);
    t?.errand({ ...visitSpot(max) }, 7.4, "Vou falar com o Max", "**Rui** foi mostrar o CPA do Meta ao **Max**");
    if (t) {
      const s = w.segs.filter((x) => x.bot === "rui" && x.kind === "stand").pop();
      if (s) w.says.push({ bot: "rui", t0: s.t0 + 0.2, t1: s.t0 + 3.6, text: "Max, o CPA do Meta caiu 18%." }, { bot: "max", t0: s.t0 + 3.8, t1: s.t0 + 7.2, text: "Boa. Subo o lance no Google." });
    }
  }
  trip("kim", 38)?.errand(COFFEE_SPOT, 5, "Pegando um café antes da call", "**Kim** foi pegar um café");
  trip("davi", 6)?.errand(meetingSpot(0), 9, "Revisando o corte com a equipe", "**Davi** foi à sala de reunião revisar o corte");
  const gui = h("gui");
  if (gui) {
    const t = trip("ze", 8);
    t?.errand({ ...visitSpot(gui) }, 7.4, "Levando o resultado dos testes", "**Zé** levou o resultado dos testes ao **Gui**");
    const s = w.segs.filter((x) => x.bot === "ze" && x.kind === "stand").pop();
    if (s) w.says.push({ bot: "ze", t0: s.t0 + 0.2, t1: s.t0 + 3.6, text: "Gui, os 214 testes do PR 142 passaram." }, { bot: "gui", t0: s.t0 + 3.8, t1: s.t0 + 7.2, text: "Ótimo. Agora é com o conselho." });
  }
  trip("pri", 40)?.errand(COFFEE_SPOT, 6, "Café e roadmap do trimestre", "**Pri** foi ao café pensar no roadmap");
  trip("caio", 4)?.errand(meetingSpot(1), 10, "Treinando o Sabor de Minas no sistema", "**Caio** abriu a sala de reunião para treinar um restaurante");
  trip("nina", 14)?.errand(COFFEE_SPOT, 5, "Fechando o chamado da Pizzaria Bella", "**Nina** fechou o chamado da Pizzaria Bella");
  trip("sol", 47)?.errand(meetingSpot(1), 7, "Call com um cliente da Domma", "**Sol** entrou numa call de suporte");

  w.says.push(
    { bot: "tavinho", t0: 3, t1: 8, text: "Pauta de hoje: deploy do PR 142 e propostas da FoodX." },
    { bot: "fabio", t0: 8.5, t1: 12.5, text: "As 12 propostas estão prontas." },
    { bot: "dante", t0: 26, t1: 30, text: "O PR 142 passou nos testes." },
    { bot: "rafa", t0: 44, t1: 48, text: "CPA da Academia Pulso caiu 32%." },
  );

  if (liaStart > 0) w.statusOverride.push({ bot: "lia", t0: liaStart, t1: 1e9, status: "trabalhando" });
  if (liaStart > 0) w.events.push({ t: liaStart, text: "**Lia** começou o roteiro do vídeo da FoodX" });

  const end = Math.max(...w.segs.map((s) => s.t1), 60);
  w.cycle = Math.ceil(end + 3);
  w.car.sort((a, b) => a.t0 - b.t0);
  w.carStart = w.car[0]?.from ?? 4;
  const calls: CarMove[] = [];
  let at = w.carStart;
  let free = 0;
  for (const mv of w.car) {
    if (mv.from !== at) {
      const travel = Math.abs(mv.from - at) * FLOOR_TIME;
      const t1 = mv.t0 - DWELL - 1.8;
      calls.push({ t0: Math.max(free, t1 - travel), t1, from: at, to: mv.from });
    }
    at = mv.to;
    free = mv.t1;
  }
  w.car = [...w.car, ...calls].sort((a, b) => a.t0 - b.t0);
  w.events.sort((a, b) => a.t - b.t);
  return w;
}

export interface Pose {
  floor: number;
  floorY: number;
  x: number;
  z: number;
  facing: number;
  mode: Mode;
  stride: number;
}

const local = (w: World, t: number) => ((t % w.cycle) + w.cycle) % w.cycle;

export function carFloor(w: World, t: number): number {
  const lt = local(w, t);
  let y = w.carStart;
  for (const mv of w.car) {
    if (lt < mv.t0) break;
    if (lt <= mv.t1) {
      const p = (lt - mv.t0) / Math.max(0.001, mv.t1 - mv.t0);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      return mv.from + (mv.to - mv.from) * e;
    }
    y = mv.to;
  }
  return y;
}

export function doorOpen(w: World, floor: number, t: number): number {
  const lt = local(w, t);
  const cy = carFloor(w, t);
  if (Math.abs(cy - floor) > 0.02) return 0;
  let open = 0;
  const ramp = (a: number, b: number) => {
    if (lt < a - 0.35 || lt > b + 0.35) return 0;
    if (lt < a) return 1 - (a - lt) / 0.35;
    if (lt > b) return 1 - (lt - b) / 0.35;
    return 1;
  };
  for (const s of w.segs) {
    if (s.kind === "walk" && s.carDoor && s.floor === floor) open = Math.max(open, ramp(s.t0 - 0.6, s.t1 + 0.15));
  }
  return open;
}

export function poseAt(w: World, botId: string, t: number, frozen = false): Pose | undefined {
  const home = w.homes.get(botId);
  if (!home) return undefined;
  const base: Pose = { floor: home.floor, floorY: home.floor, x: home.x, z: home.z, facing: home.facing, mode: "sentado", stride: 0 };
  if (frozen) return base;
  const lt = local(w, t);
  const s = w.segs.find((x) => x.bot === botId && lt >= x.t0 && lt < x.t1);
  if (!s) return base;
  if (s.kind === "stand") return { floor: s.floor, floorY: s.floor, x: s.pos!.x, z: s.pos!.z, facing: s.facing ?? 0, mode: "parado", stride: 0 };
  if (s.kind === "ride") {
    const cy = carFloor(w, t);
    return { floor: Math.round(cy), floorY: cy, x: ELEV.inside.x, z: ELEV.inside.z, facing: 0, mode: "elevador", stride: 0 };
  }
  const p = Math.min(1, (lt - s.t0) / (s.t1 - s.t0));
  const d = p * s.total!;
  const lens = s.lens!;
  const path = s.path!;
  let i = 1;
  while (i < lens.length - 1 && lens[i]! < d) i++;
  const a = path[i - 1]!;
  const b = path[i]!;
  const segLen = lens[i]! - lens[i - 1]!;
  const q = segLen > 0 ? (d - lens[i - 1]!) / segLen : 1;
  return {
    floor: s.floor,
    floorY: s.floor,
    x: a.x + (b.x - a.x) * q,
    z: a.z + (b.z - a.z) * q,
    facing: Math.atan2(b.x - a.x, b.z - a.z),
    mode: "andando",
    stride: d * 3.2,
  };
}

export function bubblesAt(w: World, t: number): { bot: string; text: string }[] {
  const lt = local(w, t);
  const out: { bot: string; text: string }[] = [];
  for (const s of w.says) if (lt >= s.t0 && lt < s.t1) out.push({ bot: s.bot, text: s.text });
  for (const s of w.segs) {
    if (s.bubble && lt >= s.t0 && lt < s.t0 + (s.bubbleFor ?? s.t1 - s.t0) && !out.some((o) => o.bot === s.bot)) out.push({ bot: s.bot, text: s.bubble });
  }
  return out;
}

export function statusAt(w: World, bot: Bot, t: number): Status {
  const lt = local(w, t);
  const o = w.statusOverride.find((x) => x.bot === bot.id && lt >= x.t0 && lt < x.t1);
  return o ? o.status : bot.status;
}

export function eventsBetween(w: World, a: number, b: number): LiveEvent[] {
  if (b <= a) return [];
  const out: LiveEvent[] = [];
  const c0 = Math.floor(a / w.cycle);
  const c1 = Math.floor(b / w.cycle);
  for (let c = c0; c <= c1; c++) {
    for (const e of w.events) {
      const abs = c * w.cycle + e.t;
      if (abs > a && abs <= b) out.push({ t: abs, text: e.text });
    }
  }
  return out;
}
