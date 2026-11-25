import { Info } from "lucide-react";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { useStore } from "@/state/store";
import type { GatewayRefusal } from "../../shared/trial-credit";

const NOTE: Record<"used_up" | "ended" | GatewayRefusal, LocaleKey> = {
  used_up: "engines.trialCreditUsedUp",
  ended: "engines.trialCreditEnded",
  credits_used_up: "engines.gatewayCreditsUsedUp",
  plan_suspended: "engines.gatewayPlanSuspended",
  model_not_in_plan: "engines.gatewayModelNotInPlan",
  plan_limit: "engines.gatewayPlanLimit",
  unavailable: "engines.gatewayUnavailable",
};

/** A turn the trial credit or the plan's AI credits could no longer pay for: a quiet note with the one way on, never an error in the chat. */
export function TrialCreditNotice({ kind }: { kind: keyof typeof NOTE }) {
  const { dispatch } = useStore();
  return (
    <div role="note" data-trial-credit-notice={kind} className="flex justify-start">
      <div className="w-fit max-w-[min(var(--chat-bubble-max),var(--chat-bubble-pct))] rounded-xl border border-hairline/60 bg-raised/50 px-3.5 py-2.5 text-[14px] text-ink">
        <div className="flex items-start gap-2">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-secondary" />
          <span className="min-w-0 break-words">{t(NOTE[kind])}</span>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: "toggleAppSettings", open: true, section: "engines" })}
          className="ui-button ui-button-md mt-2 rounded-full"
        >
          {t("chat.error.connectOwnAi")}
        </button>
      </div>
    </div>
  );
}
