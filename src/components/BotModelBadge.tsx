import type { Bot, InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { engineDisplayName } from "@/lib/engine-name";
import { InstanceProviderMark } from "./ProviderIcons";

export function botModel(bot: Pick<Bot, "modelSelection">, instances: InstanceInfo[]): { instance: InstanceInfo; label: string } | null {
  const instance = instances.find((item) => item.instanceId === bot.modelSelection.instanceId);
  if (!instance) return null;
  const id = bot.modelSelection.model || instance.models?.default || "";
  const label = instance.models?.options?.find((option) => option.id === id)?.label ?? id;
  return { instance, label: label || engineDisplayName(instance) };
}

export function botTooltip(bot: Pick<Bot, "name" | "title" | "chiefOfStaff" | "modelSelection">, instances: InstanceInfo[]): string {
  const model = botModel(bot, instances);
  return [
    bot.name,
    bot.title.trim(),
    bot.chiefOfStaff ? t("sidebar.bot.chiefOfStaff") : "",
    model ? t("sidebar.bot.modelBadge", { model: model.label, engine: model.instance.displayName }) : "",
  ].filter(Boolean).join(" · ");
}

/** Simple mode's faded engine mark. It has no title of its own, so hovering it still shows the row's tooltip with the model and engine. */
export function BotEngineMark({ bot, instances, className }: { bot: Pick<Bot, "modelSelection">; instances: InstanceInfo[]; className?: string }) {
  const model = botModel(bot, instances);
  if (!model) return null;
  return (
    <span data-testid="model-badge" role="img" aria-label={t("sidebar.bot.modelBadge", { model: model.label, engine: model.instance.displayName })}
      className={cn("flex shrink-0", className)}>
      <InstanceProviderMark instance={model.instance} size={14} subtle />
    </span>
  );
}
