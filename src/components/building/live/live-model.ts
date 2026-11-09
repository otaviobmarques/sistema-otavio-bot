import type { Bot } from "@/state/store";
import { figurinhaPalette, type FigurinhaPalette } from "@/lib/figurinha";
import { resolveFigurinha, type FigurinhaLook } from "../../../../shared/figurinha";
import type { BuildingFloor } from "../building-floors";
import type { DeskStatus } from "../building-view";

export type OutfitTop = "shirt" | "tee" | "hoodie" | "blazer" | "polo";

export interface Outfit {
  top: OutfitTop;
  color: string;
  tie?: boolean;
  pants?: string;
}

/** A bot as the live Building draws it. */
export interface LiveBot {
  id: string;
  name: string;
  role: string;
  status: DeskStatus;
  /** What its desk balloon says: the step it is on, or why it waits or is stuck. */
  line: string | null;
  look: FigurinhaLook;
  palette: FigurinhaPalette;
  outfit: Outfit;
  level: number;
  /** Its room on the level, or -1 for a seat at the board table. */
  room: number;
}

export type LevelKind = "lobby" | "office" | "penthouse";

export interface LiveLevel {
  level: number;
  kind: LevelKind;
  companyId: string | null;
  name: string;
  sub: string;
  accent: string;
  face: string;
  rooms: string[];
}

export interface LiveLayout {
  /** Index is the level: 0 the ground floor, the last one the penthouse. */
  levels: LiveLevel[];
  penthouse: number;
  bots: LiveBot[];
}

export interface LiveNames {
  presidency: string;
  boardRoom: string;
  reception: string;
  receptionLine: string;
  noCompany: string;
  general: string;
}

const PENTHOUSE_COLORS = { accent: "#f59e0b", face: "#fde68a" };
const LOBBY_COLORS = { accent: "#3b82f6", face: "#93c5fd" };
const NO_COMPANY_COLORS = { accent: "#64748b", face: "#cbd5e1" };

export function mixHex(hex: string, toward: string, amount: number): string {
  const parse = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : 0x3b82f6;
  const a = parse(hex);
  const b = parse(toward);
  const channel = (shift: number) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * amount);
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

const TOPS: OutfitTop[] = ["tee", "polo", "shirt", "hoodie", "blazer"];
const SHIRTS = ["#e5e7eb", "#bfdbfe", "#fde68a", "#c7d2fe", "#334155", "#1f2937", "#fecdd3", "#0f766e"];
const PANTS = ["#2a3142", "#335c8a", "#3f4a5e", "#57534e"];

/** Clothes follow from the bot's id, so a bot dresses the same on every screen. */
export function outfitFor(id: string): Outfit {
  const h = hash(id);
  const top = TOPS[h % TOPS.length]!;
  return {
    top,
    color: SHIRTS[Math.floor(h / 5) % SHIRTS.length]!,
    pants: PANTS[Math.floor(h / 41) % PANTS.length]!,
    ...((top === "shirt" || top === "blazer") && Math.floor(h / 7) % 2 === 0 ? { tie: true } : {}),
  };
}

/** The look and colours of a bot's figurinha, as its avatar draws it. */
export function figurinhaFor(bot: Pick<Bot, "id" | "name" | "color" | "figurinha" | "mascotBody">): { look: FigurinhaLook; palette: FigurinhaPalette } {
  return { look: resolveFigurinha({ seed: bot.id ?? bot.name, choice: bot.figurinha, body: bot.mascotBody }), palette: figurinhaPalette(bot.color) };
}

/** The Building's levels from the ground up: the ground floor (the rooms in no company, or the reception when there are
 * none), one office per company in the order the owner set (its first company on top), and the penthouse with the board.
 * A Chief of Staff in no company sits at the board table. */
export function liveLayout(floors: readonly BuildingFloor<Bot>[], context: {
  status: ReadonlyMap<string, DeskStatus>;
  lines: ReadonlyMap<string, string>;
  names: LiveNames;
}): LiveLayout {
  const { names } = context;
  const companyFloors = floors.filter((floor) => floor.company);
  const loose = floors.find((floor) => !floor.company);
  const penthouse = companyFloors.length + 1;
  const bots: LiveBot[] = [];
  const place = (bot: Bot, level: number, room: number) => {
    const status = context.status.get(bot.id) ?? "idle";
    bots.push({
      id: bot.id, name: bot.name, role: bot.title.trim(), status, line: context.lines.get(bot.id) ?? null,
      ...figurinhaFor(bot), outfit: outfitFor(bot.id), level, room,
    });
  };

  const looseRooms = (loose?.rooms ?? []).map((room) => ({ ...room, bots: room.bots.filter((bot) => !bot.chiefOfStaff) })).filter((room) => room.bots.length > 0);
  const ground: LiveLevel = looseRooms.length > 0
    ? { level: 0, kind: "office", companyId: null, name: names.noCompany, sub: names.reception, ...NO_COMPANY_COLORS, rooms: looseRooms.map((room) => room.department ?? names.general) }
    : { level: 0, kind: "lobby", companyId: null, name: names.reception, sub: names.receptionLine, ...LOBBY_COLORS, rooms: [] };
  looseRooms.forEach((room, index) => room.bots.forEach((bot) => place(bot, 0, index)));

  const offices = companyFloors.map((floor, index): LiveLevel => {
    const company = floor.company!;
    const level = companyFloors.length - index;
    floor.rooms.forEach((room, roomIndex) => room.bots.forEach((bot) => place(bot, level, roomIndex)));
    return {
      level, kind: "office", companyId: company.id, name: company.name, sub: company.sector,
      accent: company.color, face: mixHex(company.color, "#ffffff", 0.55), rooms: floor.rooms.map((room) => room.department ?? names.general),
    };
  }).reverse();

  for (const room of loose?.rooms ?? []) for (const bot of room.bots) if (bot.chiefOfStaff) place(bot, penthouse, -1);
  const top: LiveLevel = { level: penthouse, kind: "penthouse", companyId: null, name: names.presidency, sub: names.boardRoom, ...PENTHOUSE_COLORS, rooms: [] };
  return { levels: [ground, ...offices, top], penthouse, bots };
}

/** What changes where bots sit: who is on which level and room. Status and lines do not move anyone. */
export function seatingKey(layout: LiveLayout): string {
  return [layout.levels.map((level) => `${level.kind}:${level.rooms.length}`).join(","), ...layout.bots.map((bot) => `${bot.id}@${bot.level}.${bot.room}`)].join("|");
}
