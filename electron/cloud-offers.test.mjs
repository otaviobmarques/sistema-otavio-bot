import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CLOUD_OFFERS_ENABLED } from "./cloud-offers.mjs";

const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
const body = (start) => main.slice(main.indexOf(start), main.indexOf("\n}\n", main.indexOf(start)));

it("MausBot Cloud is never offered from the desktop: no Add a Cloud… in the menus, no Cloud on the rail's ＋, no checkout", () => {
  expect(CLOUD_OFFERS_ENABLED).toBe(false);
  expect(body("function cloudOffersAllowed()")).toMatch(/return CLOUD_OFFERS_ENABLED && /);
  expect(body("function cloudMenuOptions(")).toMatch(/cloudOffersAllowed\(\) \? \{ onAddCloud/);
  expect(body("async function openCloudAdd(source)")).toContain("if (!cloudOffersAllowed() || !serverReady) return;");
  expect(main).toMatch(/choices: \(\) => \(\{ cloud: cloudOffersAllowed\(\),/);
  expect(main).toMatch(/async function cloudOffersReady\(\) \{[^}]*return cloudOffersAllowed\(\);/);
});
