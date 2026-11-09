// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudOffer } from "../../electron/cloud-home.mjs";
import type { RailAddChoices } from "../../electron/cloud-rail.mjs";
import { setLocale } from "@/lib/i18n";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/cloud-buy/CloudMascotScene", () => ({ CloudMascotScene: () => null }));
vi.mock("@/components/cloud-buy/AddCloudFlow", () => ({ AddCloudFlow: () => createElement("div", { "data-add-cloud-flow": "" }) }));
vi.mock("@/components/Avatar", () => ({ MausAvatar: () => null }));
const { cloudOffersEnabled, offeredAddChoices, setCloudOffersForTest } = await import("./cloud-offers");
const { buyOfferAllowed, xResearchAction } = await import("./cloud-plan");
const { introChips, setupSteps } = await import("./default-bot");
const { cloudAddShows } = await import("@/components/CloudAddDialog");
const { CloudTrialIntroCard } = await import("@/components/CloudTrialIntro");
const { WhatsNewPopup } = await import("@/components/whats-new/WhatsNewPopup");
const { BoatOfferPanel } = await import("@/components/BoatOffer");
const { PlaceAddSheet } = await import("@/components/PlaceAddSheet");
const { schedulePlace } = await import("@/components/RoutineScheduleNote");
const { cloudRow } = await import("@/components/AccountMenu");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const OFFER: CloudOffer = { plans: [{ tier: "starter", label: "Starter", amount: 1500, trialDays: 7 }, { tier: "pro", label: "Pro", amount: 4900, trialDays: 7 }],
  recommended: "pro", creditUsd: 5, refundDays: 14 };
const ADD: RailAddChoices = { cloud: true, link: true, address: true };
const fresh = { aiReady: false, ownBots: 0, onCloud: false, team: false, remote: false };
const noop = () => {};

let host: HTMLDivElement, root: Root;
const shown = async (element: ReactElement) => {
  await act(async () => { root.render(element); });
  return host.innerHTML;
};
beforeEach(() => {
  setLocale("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  setCloudOffersForTest(false);
});

describe("with Cloud offers off, nothing offers MausBot Cloud", () => {
  it("is off unless a test turns it on", () => {
    expect(cloudOffersEnabled()).toBe(false);
  });

  it("no plans, Add a Cloud, trial, Get more pages or Pro offer is allowed for anyone signed out or on no plan", () => {
    for (const kind of ["signed-out", "free"] as const) expect(buyOfferAllowed({ kind })).toBe(false);
    expect(xResearchAction({ kind: "free" })).toBeNull();
    expect(schedulePlace({ cloudHome: false, local: true, plan: { kind: "signed-out" }, ready: false, offersAllowed: true })).toEqual({ kind: "local", next: null });
  });

  it("the welcome's setup steps and chips have no Try Cloud", () => {
    expect(setupSteps(fresh)).not.toContain("cloud");
    expect(introChips(fresh)).not.toContain("cloud");
  });

  it("the buying sheet closes on every screen that sells, and only a Cloud already paid for shows", () => {
    for (const kind of ["offer", "sign-in", "signing-in", "waiting", "has-cloud", "unreachable", "error"] as const) expect(cloudAddShows(kind), kind).toBe("close");
    expect(cloudAddShows("checking")).toBe("hide");
    for (const kind of ["starting", "ready", "team-starting", "team-ready", "settings"] as const) expect(cloudAddShows(kind), kind).toBe("show");
  });

  it("the trial intro card, the What's new popup and the Boat credit render nothing", async () => {
    expect(await shown(createElement(CloudTrialIntroCard, { offer: OFFER, onStart: noop, onHowTo: noop, onSignIn: noop, onNotNow: noop, onDismiss: noop }))).toBe("");
    const view = { slides: ["pro", "team"], audience: "none", signedIn: true, staging: false,
      plans: { pro: { name: "Pro", terms: "Pro · $49/month + tax" }, team: { name: "Team", terms: "$169/month + tax" } } } as const;
    expect(await shown(createElement(WhatsNewPopup, { view: { ...view, slides: [...view.slides] }, report: noop, onBuy: noop, onDone: noop }))).toBe("");
    expect(await shown(createElement(BoatOfferPanel))).toBe("");
  });

  it("the rail's ＋ has no Buy a Cloud and goes straight to connecting a server of your own", async () => {
    expect(offeredAddChoices(ADD)).toEqual({ ...ADD, cloud: false });
    await shown(createElement(PlaceAddSheet, { choices: ADD, onClose: noop }));
    expect(document.body.innerHTML).not.toContain("Buy a Cloud");
    expect(document.querySelector("[data-place-add-choice=cloud]")).toBeNull();
    expect(document.querySelector("[data-add-cloud-flow]")).toBeNull();
    expect(document.querySelector("[data-place-add=own-server]")).not.toBeNull();
  });

  it("the You menu has no MausBot Cloud row for someone signed in to no Cloud account, and keeps it for someone who is", () => {
    expect(cloudRow(null, false)).toBeNull();
    expect(cloudRow({ active: null } as never, false)).toBeNull();
    expect(cloudRow({ active: { id: "a", email: "a@example.test" } } as never, false)).toBe("MausBot Cloud");
    expect(cloudRow(null, true)).toBe("MausBot Cloud");
  });
});

describe("turned on through the test seam, the same entry points offer it again", () => {
  it("offers plans, Try Cloud, the trial card and Buy a Cloud", async () => {
    setCloudOffersForTest(true);
    expect(buyOfferAllowed({ kind: "signed-out" })).toBe(true);
    expect(setupSteps(fresh)).toContain("cloud");
    expect(cloudAddShows("offer")).toBe("show");
    expect(offeredAddChoices(ADD)).toBe(ADD);
    expect(await shown(createElement(CloudTrialIntroCard, { offer: OFFER, onStart: noop, onHowTo: noop, onNotNow: noop, onDismiss: noop }))).toContain("Start free trial");
  });
});
