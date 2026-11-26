import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { Bot } from "@/state/store";
import { PERSONAGENS, resolvePersonagem, type Personagem } from "../../shared/personagens";
import type { AvatarPatch } from "./avatar-editing";
import { PersonagemAvatar } from "./PersonagemAvatar";

export function botPersonagem(bot: Pick<Bot, "id" | "name" | "personagem" | "figurinha">): Personagem | null {
  return resolvePersonagem({ seed: bot.id ?? bot.name, choice: bot.personagem, figurinha: bot.figurinha });
}

export function PersonagemPicker({ bot, disabled, selectable = true, size = 44, onPatch }: {
  bot: Bot;
  disabled: boolean;
  /** False while an uploaded image shows, so no character reads as the current one. */
  selectable?: boolean;
  size?: number;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const current = selectable ? botPersonagem(bot) : null;
  return (
    <div role="group" aria-label={t("personagem.section")} data-personagem-picker="">
      <div className="mb-1.5 mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-secondary">{t("personagem.section")}</div>
      <div className="grid grid-cols-5 gap-1.5">
        {PERSONAGENS.map((personagem, index) => {
          const selected = current?.id === personagem.id;
          return (
            <button
              key={personagem.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={t("personagem.option", { n: index + 1 })}
              data-personagem-option={personagem.id}
              onClick={() => onPatch({ avatarCrop: "mascot", personagem: personagem.id })}
              className={cn(
                "flex items-center justify-center rounded-lg p-1 disabled:opacity-50",
                selected ? "bg-ink/[0.08] ring-[1.5px] ring-inset ring-ink/25" : "hover:bg-ink/[0.05]",
              )}
            >
              <PersonagemAvatar personagem={personagem} size={size} animated={false} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClassicoTitulo() {
  return <div className="mb-0 mt-4 text-[13px] font-medium text-ink">{t("personagem.classic")}</div>;
}
