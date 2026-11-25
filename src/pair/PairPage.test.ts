import { createElement, type EffectCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ effects: [] as EffectCallback[], pair: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: (effect: EffectCallback) => { f.effects.push(effect); } }));
vi.mock("../lib/session", async original => ({ ...await original<typeof import("../lib/session")>(), pairWithCode: f.pair, readSessionState: vi.fn().mockResolvedValue({ kind: "unauthenticated", error: "" }) }));
vi.mock("../components/DesktopWorkspaceSwitcher", () => ({ DesktopWorkspaceSwitcher: () => null }));
import { codeProblem, codeReady, PairPage, pairIntro, pairsAutomatically, pairTitle, unencryptedPublic } from "./PairPage";
import en from "../locales/en.json";

const code = "ABCD-EFGH-JK23";
const render = (initialCode: string | null) => { f.effects = []; return renderToStaticMarkup(createElement(PairPage, { initialCode })); };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let replaced: string[];
beforeEach(() => {
  f.pair.mockReset(); replaced = [];
  vi.stubGlobal("location", { replace: (url: string) => replaced.push(url) });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => vi.unstubAllGlobals());

it("in the desktop app, a code the link carried connects at once; a browser still asks", () => {
  expect(pairsAutomatically(code, true)).toBe(true);
  expect(pairsAutomatically(code, false)).toBe(false);
  expect(pairsAutomatically(null, true)).toBe(false);
});

it("opening My Cloud from the app needs no click and no code to type", async () => {
  vi.stubGlobal("window", { ogb: { workspaces: {} } });
  f.pair.mockResolvedValue({ ok: true });
  const html = render(code);
  expect(html).toContain("Connecting to this ArkoBot…");
  expect(html).not.toContain("Pairing code"); expect(html).not.toContain("<form");
  f.effects[0](); await flush();
  expect(f.pair).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code }));
  expect(replaced).toEqual(["/"]);
});

it("a code that no longer works falls back to the form, with the reason", async () => {
  vi.stubGlobal("window", { ogb: { workspaces: {} } });
  f.pair.mockResolvedValue({ ok: false, error: "That pairing code has expired." });
  render(code); f.effects[0](); await flush();
  expect(replaced).toEqual([]);
});

it("a browser keeps the code in the form for the person to confirm", () => {
  vi.stubGlobal("window", {});
  const html = render(code);
  expect(html).toContain(`value="${code}"`); expect(html).toContain(">Connect</button>");
  f.effects[0]?.(); expect(f.pair).not.toHaveBeenCalled();
});

it("My Cloud says where its connection starts, never 'the code shown on the server'", () => {
  const cloud = pairIntro({ mode: "code", sent: false, email: "", cloudHome: true });
  expect(cloud).toContain(`choose ${en["cloudHome.connect"]} in the ArkoBot app`);
  expect(cloud).toContain(`Settings → ${en["settings.section.cloudAccount"].replaceAll("{app}", "ArkoBot")}`);
  expect(cloud).toContain("on your Plan page");
  expect(cloud).not.toContain("from the server");
  expect(pairIntro({ mode: "code", sent: false, email: "", cloudHome: false })).toContain("from the server");
  expect(pairIntro({ mode: "email", sent: true, email: "a@b.test", cloudHome: false })).toContain("a@b.test");
});

it("a team's Cloud is called by the team's name, a person's own Cloud My Cloud", () => {
  const descriptor = (capabilities: Record<string, unknown>) => ({ environmentId: "e", label: "Acme Labs", platform: "linux", version: "1", capabilities: { remoteSessions: true as const, selfUpdate: "operator" as const, ...capabilities } });
  expect(pairTitle(descriptor({ cloudHome: true, cloudTeam: true }), "code")).toBe("Acme Labs");
  expect(pairTitle(descriptor({ cloudHome: true }), "code")).toBe("My Cloud");
  expect(pairTitle(descriptor({}), "email")).toBe("Sign in to Acme Labs");
  expect(pairTitle(null, "code")).toBe("Connect to this ArkoBot");
});

it("names a wrong kind of code instead of letting it be sent as a wrong one", () => {
  expect(codeProblem("1234 5678")).toBe(en["serverError.pair.emailCode"]);
  expect(codeProblem("123456")).toBe(en["serverError.pair.oldCode"].replaceAll("{app}", "ArkoBot"));
  expect(codeProblem(`omb_sess_${"a".repeat(43)}`)).toBe(en["serverError.pair.scriptKey"]);
  expect(codeProblem("7KQ2-M9XD")).toBeNull();
  expect(codeReady("7kq2 m9xd h4tp")).toBe(true);
  expect(codeReady("1234 5678")).toBe(false);
});

it("warns only on plain http across the open internet", () => {
  expect(unencryptedPublic({ protocol: "http:", hostname: "203.0.113.9" })).toBe(true);
  expect(unencryptedPublic({ protocol: "http:", hostname: "192.168.1.20" })).toBe(false);
  expect(unencryptedPublic({ protocol: "https:", hostname: "maus.example.com" })).toBe(false);
});

it("asks for the code first, with email sign-in as a link below, and says how to get a code", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { replace: () => {}, protocol: "http:", hostname: "203.0.113.9", origin: "http://203.0.113.9:8799" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ environmentId: "e", label: "hetzner-1", platform: "linux", version: "1", capabilities: { emailSignIn: true } }) }));
  const html = render(code);
  expect(html).toContain(en["pair.notEncrypted"].replace("'", "&#x27;"));
  expect(html).toContain(en["pair.fromLink"]);
  expect(html).toContain(">arkobot pair</code>");
  expect(html).not.toContain("openmausbot");
  expect(html.indexOf("<form")).toBeLessThan(html.indexOf(en["pair.code"]));
});

it("on a phone, keeps this page as the app: how to add it to the home screen, and no store or other app", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("location", { replace: () => {}, protocol: "https:", hostname: "bots.example.com", origin: "https://bots.example.com" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ environmentId: "e", label: "vps", platform: "linux", version: "1", capabilities: {} }) }));
  const html = render(code);
  expect(html).toContain("data-pair-install");
  expect(html).toContain(en["pair.install.iphone"]);
  expect(html).toContain(en["pair.install.android"].replace("'", "&#x27;"));
  expect(html).toContain(en["pair.install.intro"].replace("{app}", "ArkoBot"));
  expect(html).not.toMatch(/openmausbot:|apps\.apple\.com|\.apk/);
});
