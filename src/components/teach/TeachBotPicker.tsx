import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";

/** Bots in their departments (the sidebar's sections), with a box per department that picks all of its bots. */
export function teachDepartments(bots: readonly Pick<Bot, "id" | "section">[]): Array<{ name: string | null; botIds: string[] }> {
  const groups = new Map<string | null, string[]>();
  for (const bot of bots) {
    const key = bot.section?.trim() || null;
    groups.set(key, [...(groups.get(key) ?? []), bot.id]);
  }
  return [...groups.entries()]
    .map(([name, botIds]) => ({ name, botIds }))
    .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)));
}

export function TeachBotPicker({ bots, selected, onChange }: {
  bots: readonly Bot[];
  selected: readonly string[];
  onChange: (botIds: string[]) => void;
}) {
  const chosen = new Set(selected);
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const toggle = (ids: readonly string[], on: boolean) => {
    const next = new Set(chosen);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onChange([...next]);
  };
  return (
    <fieldset className="flex flex-col gap-2" data-teach="bots">
      <legend className="mb-1 text-[12px] text-ink-secondary">{t("teach.field.bots")}</legend>
      {teachDepartments(bots).map((group) => {
        const all = group.botIds.every((id) => chosen.has(id));
        return (
          <div key={group.name ?? ""} className="rounded-lg border border-hairline/60 p-2">
            {group.name !== null && (
              <label className="flex items-center gap-2 text-[12px] font-medium text-ink">
                <input type="checkbox" checked={all} onChange={(event) => toggle(group.botIds, event.target.checked)} />
                {t("teach.department", { name: group.name })}
              </label>
            )}
            <div className={`flex flex-wrap gap-x-4 gap-y-1 ${group.name !== null ? "mt-1 pl-5" : ""}`}>
              {group.botIds.map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-[13px] text-ink">
                  <input type="checkbox" checked={chosen.has(id)} onChange={(event) => toggle([id], event.target.checked)} />
                  {byId.get(id)?.name ?? id}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
