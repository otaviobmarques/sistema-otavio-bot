import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  COMPANY_DEFAULT_COLOR,
  COMPANY_MISSION_MAX,
  COMPANY_NAME_MAX,
  COMPANY_SECTOR_MAX,
  DEFAULT_USD_TO_BRL,
  type Company,
  type CompanyInput,
} from "../../../shared/companies";
import { cn } from "@/lib/cn";
import { intlLocale, t } from "@/lib/i18n";
import { imeComposing } from "@/lib/send-key";
import { createCompany, deleteCompany, orderCompanies, updateCompany, useCompanies } from "@/state/companies";
import { useStore } from "@/state/store";
import { departmentNames } from "../bot-sections";
import { Field, inputCls } from "../bot-settings/field";
import { ConfirmDialog } from "../ConfirmDialog";
import { moneyLabel } from "./building-floors";
import { CompanyRulesEditor, ruleDraftsOf, rulesFromDrafts, type RuleDraft } from "./CompanyRulesEditor";

const SWATCHES = ["#FF2D33", "#00E5A0", "#7B61FF", "#FF8A1F", "#2F80ED", "#F2C94C"];
const NEW = "new";

interface Draft {
  name: string;
  sector: string;
  mission: string;
  color: string;
  budget: string;
  rate: string;
  rules: RuleDraft[];
  departmentIds: string[];
}

const draftOf = (company: Company | undefined): Draft => company
  ? { name: company.name, sector: company.sector, mission: company.mission, color: company.color, budget: company.monthlyBudgetBrl === null ? "" : String(company.monthlyBudgetBrl),
    rate: company.usdToBrl === null ? "" : String(company.usdToBrl), rules: ruleDraftsOf(company.rules), departmentIds: company.departmentIds }
  : { name: "", sector: "", mission: "", color: COMPANY_DEFAULT_COLOR, budget: "", rate: "", rules: [], departmentIds: [] };

/** The budget field as the server takes it: empty is no budget; anything but a number of zero or more is refused. */
export function budgetFromField(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The dollar rate field: empty is the default rate; anything but a number above zero is refused. */
export function rateFromField(text: string): number | null | undefined {
  const value = budgetFromField(text);
  return value === 0 ? undefined : value;
}

const failure = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Create, edit, reorder and delete the companies, and choose each one's departments. */
export function CompaniesDialog({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const { state } = useStore();
  const companies = useCompanies() ?? [];
  const departments = useMemo(() => departmentNames(state), [state]);
  const [selected, setSelected] = useState<string>(initial ?? companies[0]?.id ?? NEW);
  const company = companies.find((one) => one.id === selected);
  const [draft, setDraft] = useState<Draft>(() => draftOf(company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Company | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    setDraft(draftOf(companies.find((one) => one.id === id)));
    setError("");
  };
  const budget = budgetFromField(draft.budget);
  const rate = rateFromField(draft.rate);
  const rules = rulesFromDrafts(draft.rules);
  const ready = draft.name.trim() !== "" && budget !== undefined && rate !== undefined && rules !== undefined && !saving;

  const run = async (work: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(failure(cause));
    } finally {
      setSaving(false);
    }
  };
  const save = () => {
    if (!ready) return;
    const input: CompanyInput = { name: draft.name.trim(), sector: draft.sector.trim(), mission: draft.mission.trim(), color: draft.color, monthlyBudgetBrl: budget ?? null,
      usdToBrl: rate ?? null, rules: rules ?? [], departmentIds: draft.departmentIds };
    void run(async () => {
      const saved = company ? await updateCompany(company.id, input) : await createCompany(input);
      if (saved) { setSelected(saved.id); setDraft(draftOf(saved)); }
    });
  };
  const move = (index: number, by: -1 | 1) => {
    const ids = companies.map((one) => one.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    void run(() => orderCompanies(ids));
  };
  const remove = (target: Company) => void run(async () => {
    await deleteCompany(target.id);
    setDeleting(null);
    if (target.id === selected) choose(NEW);
  });
  const toggleDepartment = (department: string) => setDraft((previous) => ({
    ...previous,
    departmentIds: previous.departmentIds.includes(department) ? previous.departmentIds.filter((one) => one !== department) : [...previous.departmentIds, department],
  }));
  const holder = (department: string) => companies.find((one) => one.id !== company?.id && one.departmentIds.includes(department));
  const close = () => { if (!saving) onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="companies-title" data-companies-dialog=""
        className="flex max-h-[90vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-hairline/50 bg-panel text-ink shadow-2xl"
        onKeyDown={(event) => {
          if (imeComposing(event.nativeEvent)) { event.stopPropagation(); return; }
          if (event.key === "Escape" && !deleting) { event.stopPropagation(); close(); }
        }}>
        <div className="flex items-center justify-between gap-3 border-b border-hairline/50 px-5 py-4">
          <div className="min-w-0">
            <h2 id="companies-title" className="text-[17px] font-semibold">{t("companies.title")}</h2>
            <p className="mt-0.5 text-[13px] text-ink-secondary">{t("companies.intro")}</p>
          </div>
          <button type="button" aria-label={t("companies.close")} disabled={saving} onClick={close} className="rounded-lg p-1.5 text-ink-secondary hover:bg-raised"><X size={18} /></button>
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label={t("companies.floors")} className="border-b border-hairline/50 p-3 md:border-b-0 md:border-r">
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">{t("companies.floors")}</div>
            <ul className="space-y-1">
              {companies.map((one, index) => (
                <li key={one.id} data-company-row={one.id} className={cn("group flex items-center gap-1 rounded-lg", one.id === selected && "bg-raised")}>
                  <button type="button" onClick={() => choose(one.id)} aria-current={one.id === selected ? "true" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] outline-none hover:bg-raised/60 focus-visible:ring-2 focus-visible:ring-focus">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: one.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{one.name}</span>
                  </button>
                  <button type="button" disabled={saving || index === 0} onClick={() => move(index, -1)} aria-label={t("companies.moveUp", { name: one.name })} title={t("companies.moveUp", { name: one.name })}
                    className="rounded p-1 text-ink-tertiary hover:bg-raised hover:text-ink disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button type="button" disabled={saving || index === companies.length - 1} onClick={() => move(index, 1)} aria-label={t("companies.moveDown", { name: one.name })} title={t("companies.moveDown", { name: one.name })}
                    className="rounded p-1 text-ink-tertiary hover:bg-raised hover:text-ink disabled:opacity-30"><ArrowDown size={14} /></button>
                </li>
              ))}
            </ul>
            {companies.length === 0 && <p className="px-2 py-1 text-[13px] text-ink-tertiary">{t("companies.none")}</p>}
            <button type="button" data-company-new="" disabled={saving} onClick={() => choose(NEW)}
              className={cn("mt-2 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-hairline px-2 py-2 text-[13px] text-accent hover:bg-raised/60", selected === NEW && "bg-raised")}>
              <Plus size={14} />{t("companies.new")}
            </button>
          </nav>
          <form className="flex min-w-0 flex-col gap-4 p-5" onSubmit={(event) => { event.preventDefault(); save(); }}>
            <h3 className="text-[15px] font-semibold">{company ? company.name : t("companies.new")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("companies.name")}>
                <input value={draft.name} maxLength={COMPANY_NAME_MAX} disabled={saving} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputCls} />
              </Field>
              <Field label={t("companies.sector")}>
                <input value={draft.sector} maxLength={COMPANY_SECTOR_MAX} disabled={saving} placeholder={t("companies.sectorHint")} onChange={(event) => setDraft({ ...draft, sector: event.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label={t("companies.mission")}>
              <textarea value={draft.mission} maxLength={COMPANY_MISSION_MAX} rows={2} disabled={saving} placeholder={t("companies.missionHint")}
                onChange={(event) => setDraft({ ...draft, mission: event.target.value })} className={cn(inputCls, "resize-none")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset disabled={saving}>
                <legend className="mb-1.5 text-[13px] text-ink-secondary">{t("companies.color")}</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((swatch) => (
                    <button key={swatch} type="button" onClick={() => setDraft({ ...draft, color: swatch })} aria-label={swatch} aria-pressed={draft.color.toUpperCase() === swatch}
                      className={cn("size-7 rounded-full ring-offset-2 ring-offset-panel", draft.color.toUpperCase() === swatch ? "ring-2 ring-ink" : "ring-1 ring-hairline")} style={{ backgroundColor: swatch }} />
                  ))}
                  <input type="color" value={draft.color} aria-label={t("companies.colorPick")} onChange={(event) => setDraft({ ...draft, color: event.target.value.toUpperCase() })}
                    className="h-7 w-9 cursor-pointer rounded border border-hairline bg-transparent" />
                </div>
              </fieldset>
              <Field label={t("companies.budget")}>
                <input value={draft.budget} inputMode="decimal" disabled={saving} placeholder={t("companies.budgetHint")} aria-invalid={budget === undefined}
                  onChange={(event) => setDraft({ ...draft, budget: event.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <span className="max-sm:hidden" />
              <Field label={t("companies.rate")}>
                <input value={draft.rate} inputMode="decimal" disabled={saving} placeholder={t("companies.rateHint", { rate: moneyLabel(DEFAULT_USD_TO_BRL, intlLocale()) })} aria-invalid={rate === undefined}
                  onChange={(event) => setDraft({ ...draft, rate: event.target.value })} className={inputCls} />
              </Field>
            </div>
            <CompanyRulesEditor rules={draft.rules} disabled={saving} onChange={(next) => setDraft((previous) => ({ ...previous, rules: next }))} />
            <fieldset disabled={saving}>
              <legend className="mb-1.5 text-[13px] text-ink-secondary">{t("companies.departments")}</legend>
              {departments.length === 0
                ? <p className="text-[13px] text-ink-tertiary">{t("companies.noDepartments")}</p>
                : <ul className="grid gap-1.5 sm:grid-cols-2">
                  {departments.map((department) => {
                    const other = holder(department);
                    return (
                      <li key={department}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-inset px-3 py-2 text-[13px]">
                          <input type="checkbox" data-company-department={department} checked={draft.departmentIds.includes(department)} onChange={() => toggleDepartment(department)} className="accent-accent" />
                          <span className="min-w-0 flex-1 truncate">{department}</span>
                          {other && !draft.departmentIds.includes(department) && <span className="shrink-0 text-[12px] text-ink-tertiary">{t("companies.inCompany", { name: other.name })}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>}
              <p className="mt-1.5 text-[12px] text-ink-tertiary">{t("companies.departmentsHint")}</p>
            </fieldset>
            {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
              {company
                ? <button type="button" disabled={saving} onClick={() => setDeleting(company)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-danger hover:bg-danger/10"><Trash2 size={14} />{t("companies.delete")}</button>
                : <span />}
              <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={close} className="rounded-lg px-3 py-2 text-[13px] text-ink-secondary hover:bg-raised">{t("common.cancel")}</button>
                <button type="submit" disabled={!ready} data-company-save="" className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">
                  {saving ? t("companies.saving") : company ? t("common.save") : t("companies.create")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <ConfirmDialog open={deleting !== null} title={t("companies.deleteTitle", { name: deleting?.name ?? "" })} body={t("companies.deleteBody")}
        confirmLabel={t("companies.delete")} pending={saving} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) remove(deleting); }} />
    </div>, document.body,
  );
}
