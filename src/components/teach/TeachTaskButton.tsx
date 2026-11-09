import { Video } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { t } from "@/lib/i18n";
import { TEACH_SKILL_SOURCE } from "../../../shared/teach-task";

const TeachTaskDialog = lazy(() => import("./TeachTaskDialog").then((module) => ({ default: module.TeachTaskDialog })));

export function isTaughtSkill(source: string | undefined): boolean {
  return source === TEACH_SKILL_SOURCE;
}

export function skillSourceLabel(source: string): string {
  return isTaughtSkill(source) ? t("teach.origin") : source;
}

/** "Recorded by you (Teach-a-task)" next to a skill that came from a recording. */
export function TaughtSkillBadge({ source }: { source: string | undefined }) {
  if (!isTaughtSkill(source)) return null;
  return (
    <span data-teach="origin" className="inline-flex shrink-0 items-center gap-1 rounded bg-accent/10 px-1.5 py-px text-[10px] font-medium text-accent">
      <Video size={10} aria-hidden="true" />{t("teach.origin")}
    </span>
  );
}

/** Opens the recorder. `botId`: the bot whose page it sits on, picked to receive the skill. */
export function TeachTaskButton({ botId, onSaved, render }: {
  botId?: string;
  onSaved?: () => void;
  render?: (open: () => void, label: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const label = t(botId ? "teach.openForBot" : "teach.open");
  const show = () => setOpen(true);
  return (
    <>
      {render ? render(show, label) : (
        <button
          type="button"
          data-teach="open"
          onClick={show}
          className="flex items-center gap-2 rounded-lg bg-control px-3 py-2 text-[13px] text-ink hover:bg-raised-hover"
        >
          <Video size={14} aria-hidden="true" />{label}
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <TeachTaskDialog initialBotIds={botId ? [botId] : []} onClose={() => setOpen(false)} onSaved={() => onSaved?.()} />
        </Suspense>
      )}
    </>
  );
}
