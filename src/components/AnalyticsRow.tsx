import { useState } from "react";
import { analyticsEnabled, setAnalyticsEnabled } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { SettingRow, Switch } from "./SettingsPrimitives";

export function AnalyticsRow({ simple = false }: { simple?: boolean }) {
  const [on, setOn] = useState(analyticsEnabled);
  const subtitle = t(simple ? "settings.simple.analytics" : "settings.analytics.subtitle");
  return (
    <SettingRow title={t("settings.analytics.title")} subtitle={subtitle}>
      <Switch
        checked={on}
        aria-label={t("settings.analytics.aria")}
        onClick={() => {
          const next = !on;
          setAnalyticsEnabled(next);
          setOn(next);
        }}
      />
    </SettingRow>
  );
}
