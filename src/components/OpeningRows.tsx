import { useEffect, useState } from "react";

import { t } from "@/lib/i18n";
import type { OpeningChoice } from "../../electron/desktop-prefs.mjs";
import { SettingRow, Switch } from "./SettingsPrimitives";

/** Settings' switches for the desktop app's opening video and its sound: this desktop's choice. */
export function OpeningRows() {
  const bridge = typeof window === "undefined" ? undefined : window.ogb?.opening;
  const [choice, setChoice] = useState<OpeningChoice | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    void bridge.state().then((next) => { if (alive) setChoice(next); }).catch(() => {});
    return () => { alive = false; };
  }, [bridge]);
  if (!bridge || !choice) return null;
  const change = (next: Partial<OpeningChoice>) => void bridge.set(next).then(setChoice).catch(() => {});
  return <div data-opening-switches>
    <SettingRow title={t("settings.opening.title")} subtitle={t("settings.opening.subtitle")}>
      <Switch checked={choice.on} aria-label={t("settings.opening.title")} onClick={() => change({ on: !choice.on })} />
    </SettingRow>
    <SettingRow title={t("settings.opening.sound")} subtitle={t("settings.opening.soundSubtitle")}>
      <Switch checked={choice.on && choice.sound} disabled={!choice.on} aria-label={t("settings.opening.sound")} onClick={() => change({ sound: !choice.sound })} />
    </SettingRow>
  </div>;
}
