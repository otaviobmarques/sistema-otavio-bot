import type { UsageAlert } from "./accounting.ts";

/**
 * Told after commit each time an organisation crosses 50, 80 or 100% of its
 * period's plan quota (the crossing itself is already in usage_alerts and the
 * audit log). The e-mail to the customer plugs in here, on top of `Mailer`.
 */
export interface UsageAlertNotifier {
  notify(alert: UsageAlert): Promise<void>;
}

export class LogUsageAlertNotifier implements UsageAlertNotifier {
  async notify(alert: UsageAlert): Promise<void> {
    console.log(`[gateway] cliente ${alert.organizationId} usou ${alert.threshold}% da cota (${alert.usedCredits}/${alert.quotaCredits} créditos)`);
  }
}
