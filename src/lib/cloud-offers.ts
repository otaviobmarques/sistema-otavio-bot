import type { RailAddChoices } from "../../electron/cloud-rail.mjs";

const CLOUD_OFFERS_ENABLED = false;

let enabled = CLOUD_OFFERS_ENABLED;

export function cloudOffersEnabled(): boolean {
  return enabled;
}

export function setCloudOffersForTest(on: boolean): void {
  enabled = on;
}

export function offeredAddChoices(choices: RailAddChoices): RailAddChoices {
  return enabled || !choices.cloud ? choices : { ...choices, cloud: false };
}
