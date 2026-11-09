import { cn } from "@/lib/cn";
import { FIGURINHA_ACCESSORY_LABEL, FIGURINHA_EYES_LABEL, FIGURINHA_HEAD_LABEL } from "@/lib/figurinha";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { Bot } from "@/state/store";
import {
  FIGURINHA_ACCESSORIES,
  FIGURINHA_EYES,
  FIGURINHA_HEADS,
  resolveFigurinha,
  type FigurinhaLook,
} from "../../shared/figurinha";
import type { AvatarPatch } from "./avatar-editing";
import { Figurinha } from "./Figurinha";

type Part = keyof FigurinhaLook;

const PARTS: ReadonlyArray<{ part: Part; title: LocaleKey; options: readonly string[]; labels: Record<string, LocaleKey> }> = [
  { part: "head", title: "figurinha.head", options: FIGURINHA_HEADS, labels: FIGURINHA_HEAD_LABEL },
  { part: "eyes", title: "figurinha.eyes", options: FIGURINHA_EYES, labels: FIGURINHA_EYES_LABEL },
  { part: "accessory", title: "figurinha.accessory", options: FIGURINHA_ACCESSORIES, labels: FIGURINHA_ACCESSORY_LABEL },
];

export function botFigurinha(bot: Pick<Bot, "id" | "name" | "figurinha" | "mascotBody">): FigurinhaLook {
  return resolveFigurinha({ seed: bot.id ?? bot.name, choice: bot.figurinha, body: bot.mascotBody });
}

/** Head, eyes and accessory, each a row of the bot's own figurinha wearing every choice. */
export function FigurinhaPicker({ bot, disabled, selectable = true, size = 34, onPatch }: {
  bot: Bot;
  disabled: boolean;
  /** False while an uploaded image shows, so no choice reads as the current one. */
  selectable?: boolean;
  size?: number;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const look = botFigurinha(bot);
  return (
    <div data-figurinha-picker="">
      {PARTS.map(({ part, title, options, labels }) => (
        <div key={part} role="group" aria-label={t(title)}>
          <div className="mb-1.5 mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary">{t(title)}</div>
          <div className="grid grid-cols-5 gap-1.5">
            {options.map((option) => {
              const selected = selectable && look[part] === option;
              const name = t(labels[option]!);
              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={t("figurinha.use", { name })}
                  title={name}
                  data-figurinha-option={`${part}.${option}`}
                  onClick={() => onPatch({ avatarCrop: "mascot", figurinha: { ...bot.figurinha, [part]: option } })}
                  className={cn(
                    "flex items-center justify-center rounded-lg py-1.5 disabled:opacity-50",
                    selected ? "bg-ink/[0.08] ring-[1.5px] ring-inset ring-ink/25" : "hover:bg-ink/[0.05]",
                  )}
                >
                  <Figurinha look={{ ...look, [part]: option }} color={bot.color} size={size} animated={false} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
