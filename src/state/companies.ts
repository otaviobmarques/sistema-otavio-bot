import { useEffect, useSyncExternalStore } from "react";
import type { Company, CompanyInput } from "../../shared/companies";
import { listenLiveFrames } from "../lib/live-events";
import { api } from "./api";

let companies: Company[] | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => companies;

// Each read and each change takes the next number; a list lands only when nothing later has, so an older answer never
// puts a floor back where it was.
let sent = 0, shown = 0;
function show(seq: number, next: Company[]): void {
  if (seq < shown) return;
  shown = seq;
  companies = next;
  for (const listener of listeners) listener();
}

/** Tests and previews show a list of their own. */
export function setCompanies(next: Company[] | null): void {
  companies = next;
  shown = ++sent;
  for (const listener of listeners) listener();
}

export async function refreshCompanies(): Promise<void> {
  const seq = ++sent;
  const answer = await api<{ companies?: Company[] }>("/api/companies", { background: true }).catch(() => null);
  if (Array.isArray(answer?.companies)) show(seq, answer.companies);
}

let watchers = 0;
let stopLive: (() => void) | null = null;

/** The companies, top floor first; null until the first answer. Kept current by the live stream while anything reads it. */
export function useCompanies(): Company[] | null {
  useEffect(() => {
    if (watchers++ === 0) {
      void refreshCompanies();
      stopLive = listenLiveFrames({
        onFrame: (frame) => {
          if (frame.kind === "companies") show(++sent, frame.companies);
          else if (frame.kind === "sections") void refreshCompanies();
        },
        onMissedFrames: () => void refreshCompanies(),
      });
    }
    return () => {
      if (--watchers === 0) { stopLive?.(); stopLive = null; }
    };
  }, []);
  return useSyncExternalStore(subscribe, current, current);
}

async function changed(request: Promise<{ companies: Company[]; company?: Company }>): Promise<Company | undefined> {
  const seq = ++sent;
  const answer = await request;
  show(seq, answer.companies);
  return answer.company;
}

const send = (path: string, method: string, body: unknown) => api<{ companies: Company[]; company?: Company }>(path, { method, body: JSON.stringify(body) });

export const createCompany = (input: CompanyInput) => changed(send("/api/companies", "POST", input));
export const updateCompany = (id: string, patch: Partial<CompanyInput>) => changed(send(`/api/companies/${id}`, "PATCH", patch));
export const deleteCompany = (id: string) => changed(api(`/api/companies/${id}`, { method: "DELETE" }));
export const orderCompanies = (companyIds: string[]) => changed(send("/api/companies/order", "PUT", { companyIds }));
export const moveDepartmentToCompany = (department: string, companyId: string | null) => changed(send("/api/companies/departments", "PUT", { department, companyId }));

/** The company holding a department, if any. */
export const companyOf = (list: readonly Company[] | null, department: string): Company | undefined => list?.find((company) => company.departmentIds.includes(department));
