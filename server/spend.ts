// Monthly spend cap over the usage ledger; enforced only with the `budgets` entitlement.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "./config.ts";
import { entitled } from "./enterprise.ts";
import { readUsage, usageRowKey } from "./usage-ledger.ts";

export interface SpendState {
  month: string;
  monthlyUsd: number;
  spentUsd: number;
  percent: number;
  warnAtPercent: number;
  warn: boolean;
  exceeded: boolean;
}

const DEFAULT_WARN_AT_PERCENT = 80;
const CACHE_MS = 15_000;
/** What a bot spent this month in one department, `section` being the department its rows were booked in. */
export interface SpendSlice { botId: string; section: string | undefined; costUsd: number }
interface MonthRead { at: number; month: string; fileUsd: number; keys: Set<string>; slices: Map<string, SpendSlice> }
const cache = new Map<string, MonthRead>();
type Unwritten = { month: string; costUsd: number; botId: string; section: string | undefined };
// Rows whose async ledger append may not have landed yet: a long turn would otherwise re-read the month without its own row.
const unwritten = new Map<string, Map<string, Unwritten>>();

function monthOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

const costOf = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

function addSlice(slices: Map<string, SpendSlice>, botId: string, section: string | undefined, costUsd: number): void {
  const key = JSON.stringify([botId, section ?? null]);
  const slice = slices.get(key);
  if (slice) slice.costUsd += costUsd;
  else slices.set(key, { botId, section, costUsd });
}

function monthRead(dataDir: string, now: Date): MonthRead {
  const month = monthOf(now);
  let read = cache.get(dataDir);
  if (!read || read.month !== month || now.getTime() - read.at >= CACHE_MS) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rows = readUsage(dataDir, { from, to: now });
    const slices = new Map<string, SpendSlice>();
    for (const row of rows) if (costOf(row.costUsd)) addSlice(slices, row.botId, row.section, costOf(row.costUsd));
    read = { at: now.getTime(), month, fileUsd: rows.reduce((sum, row) => sum + costOf(row.costUsd), 0), keys: new Set(rows.map(usageRowKey)), slices };
    cache.set(dataDir, read);
  }
  return read;
}

const pendingOf = (dataDir: string, read: MonthRead): Unwritten[] =>
  [...unwritten.get(dataDir) ?? []].filter(([key, entry]) => entry.month === read.month && !read.keys.has(key)).map(([, entry]) => entry);

export function monthToDateSpend(dataDir: string, now = new Date()): number {
  const read = monthRead(dataDir, now);
  return read.fileUsd + pendingOf(dataDir, read).reduce((sum, entry) => sum + entry.costUsd, 0);
}

/** This month's spend by bot and department, counting turns whose ledger row has not landed yet. */
export function monthToDateSlices(dataDir: string, now = new Date()): SpendSlice[] {
  const read = monthRead(dataDir, now);
  const slices = new Map([...read.slices].map(([key, slice]) => [key, { ...slice }]));
  for (const entry of pendingOf(dataDir, read)) addSlice(slices, entry.botId, entry.section, entry.costUsd);
  return [...slices.values()];
}

export function noteSpend(
  dataDir: string,
  row: { at: string; threadId: string; botId: string; costUsd: number | null | undefined; section?: string },
  written: Promise<boolean>,
): void {
  const costUsd = costOf(row.costUsd);
  if (!costUsd) return;
  const key = usageRowKey(row);
  const month = row.at.slice(0, 7);
  const entries = unwritten.get(dataDir) ?? new Map<string, Unwritten>();
  unwritten.set(dataDir, entries);
  entries.set(key, { month, costUsd, botId: row.botId, section: row.section });
  void written.then((landed) => {
    entries.delete(key);
    if (entries.size === 0 && unwritten.get(dataDir) === entries) unwritten.delete(dataDir);
    const read = cache.get(dataDir);
    if (landed && read && read.month === month && !read.keys.has(key)) {
      read.fileUsd += costUsd;
      read.keys.add(key);
      addSlice(read.slices, row.botId, row.section, costUsd);
    }
  });
}

export function resetSpendCacheForTests(): void {
  cache.clear();
  unwritten.clear();
}

export function spendState(
  cfg: Pick<AppConfig, "budgets">,
  dataDir: string,
  now = new Date(),
  isEntitled: (feature: string) => boolean = entitled,
): SpendState | null {
  const monthlyUsd = cfg.budgets?.monthlyUsd;
  if (!isEntitled("budgets") || typeof monthlyUsd !== "number" || !Number.isFinite(monthlyUsd) || monthlyUsd <= 0) return null;
  const spentUsd = monthToDateSpend(dataDir, now);
  const warnAtPercent = cfg.budgets?.warnAtPercent ?? DEFAULT_WARN_AT_PERCENT;
  const percent = Math.min(999, Math.round((spentUsd / monthlyUsd) * 100));
  return {
    month: monthOf(now),
    monthlyUsd,
    spentUsd,
    percent,
    warnAtPercent,
    warn: percent >= warnAtPercent,
    exceeded: spentUsd >= monthlyUsd,
  };
}

function usd(value: number): string {
  return Number.isInteger(Math.round(value * 1000) / 10) ? value.toFixed(2) : value.toFixed(3);
}

export function assertWithinBudget(
  cfg: Pick<AppConfig, "budgets">,
  dataDir: string,
  now = new Date(),
  isEntitled: (feature: string) => boolean = entitled,
): void {
  const state = spendState(cfg, dataDir, now, isEntitled);
  if (!state?.exceeded) return;
  throw Object.assign(
    new Error(`this workspace has reached its monthly spend limit of $${usd(state.monthlyUsd)} — an admin can raise it under Settings → Usage`),
    { status: 409, code: "spend_cap" },
  );
}

export type SpendAlert = "warn" | "cap";

interface AlertMarks {
  month: string;
  monthlyUsd: number;
  warn?: true;
  cap?: true;
}

const ALERTS_FILE = "alerts.json";

function readMarks(dataDir: string): AlertMarks | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(dataDir, "usage", ALERTS_FILE), "utf8"));
    if (typeof value !== "object" || value === null) return null;
    const marks = value as AlertMarks;
    return typeof marks.month === "string" && typeof marks.monthlyUsd === "number" ? marks : null;
  } catch {
    return null;
  }
}

export function takeSpendAlert(dataDir: string, state: SpendState | null): SpendAlert | null {
  if (!state || (!state.warn && !state.exceeded)) return null;
  const saved = readMarks(dataDir) ?? memoryMarks.get(dataDir) ?? null;
  const marks: AlertMarks = saved && saved.month === state.month && saved.monthlyUsd === state.monthlyUsd
    ? saved
    : { month: state.month, monthlyUsd: state.monthlyUsd };
  const alert: SpendAlert | null = state.exceeded && !marks.cap ? "cap" : state.warn && !marks.warn && !marks.cap ? "warn" : null;
  if (!alert) return null;
  const next: AlertMarks = { ...marks, warn: true, ...(alert === "cap" ? { cap: true as const } : {}) };
  memoryMarks.set(dataDir, next);
  try {
    mkdirSync(join(dataDir, "usage"), { recursive: true, mode: 0o700 });
    writeFileSync(join(dataDir, "usage", ALERTS_FILE), JSON.stringify(next), { mode: 0o600 });
  } catch {
  }
  return alert;
}
const memoryMarks = new Map<string, AlertMarks>();

export function resetSpendAlertsForTests(): void {
  memoryMarks.clear();
}

export function spendAlertText(alert: SpendAlert, state: SpendState): { title: string; body: string } {
  const spent = `$${state.spentUsd.toFixed(2)} of $${usd(state.monthlyUsd)} spent this month (${state.month})`;
  return alert === "cap"
    ? { title: "Monthly spend limit reached", body: `${spent}. New turns are refused until an admin raises the limit under Settings → Usage.` }
    : { title: `Spend is at ${state.percent}% of the monthly limit`, body: `${spent}. New turns stop when the limit is reached.` };
}
