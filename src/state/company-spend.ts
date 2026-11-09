import { useEffect, useState } from "react";
import type { CompanySpend } from "../../shared/companies";
import { listenLiveFrames } from "../lib/live-events";
import { api } from "./api";

const POLL_MS = 60_000;

/** What each company spent this month against its budget, by company id; empty until the first answer, and for someone
 * who may not read the usage ledger. Read again when a company changes or a notice arrives. */
export function useCompanySpend(): ReadonlyMap<string, CompanySpend> {
  const [spend, setSpend] = useState<ReadonlyMap<string, CompanySpend>>(() => new Map());
  useEffect(() => {
    let live = true;
    const read = () => void api<{ spend?: CompanySpend[] }>("/api/companies/spend", { background: true })
      .then((answer) => { if (live && Array.isArray(answer?.spend)) setSpend(new Map(answer.spend.map((one) => [one.companyId, one]))); })
      .catch(() => {});
    read();
    const timer = setInterval(read, POLL_MS);
    const stop = listenLiveFrames({
      onFrame: (frame) => { if (frame.kind === "companies" || frame.kind === "notify") read(); },
      onMissedFrames: read,
    });
    return () => { live = false; clearInterval(timer); stop(); };
  }, []);
  return spend;
}
