import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { chatLinkFrom } from "./chat-link.mjs";
import { DEEP_LINK_SCHEMES, canonicalDeepLink, canonicalizeArgv } from "./deep-link-scheme.mjs";
import { isOrganizationDeepLink } from "./organization-entry.mjs";
import { packageUrlFromDeepLink } from "./package-link.mjs";

test("an arkobot:// link reaches the same handler as its openmausbot:// twin", () => {
  for (const [ours, theirs] of [
    ["arkobot://thread/t1?bot=b1", "openmausbot://thread/t1?bot=b1"],
    ["ArkoBot://organization", "openmausbot://organization"],
    ["arkobot://install?url=https%3A%2F%2Fexample.com%2Fp.json", "openmausbot://install?url=https%3A%2F%2Fexample.com%2Fp.json"],
  ]) assert.equal(canonicalDeepLink(ours), theirs);
  assert.deepEqual(chatLinkFrom(canonicalDeepLink("arkobot://bot/b1")), chatLinkFrom("openmausbot://bot/b1"));
  assert.equal(isOrganizationDeepLink(canonicalDeepLink("arkobot://organization")), true);
  assert.equal(packageUrlFromDeepLink(canonicalDeepLink("arkobot://install?url=x")), packageUrlFromDeepLink("openmausbot://install?url=x"));
});

test("everything else passes through untouched", () => {
  for (const value of ["openmausbot://cloud", "https://arkobot.example/", "--omb-hidden", "C:\\arkobot\\x", undefined, 3]) {
    assert.equal(canonicalDeepLink(value), value);
  }
});

test("a command line's links are rewritten in place, as relaunch reuses it", () => {
  const argv = ["ArkoBot.exe", "--flag", "arkobot://cloud"];
  assert.equal(canonicalizeArgv(argv), argv);
  assert.deepEqual(argv, ["ArkoBot.exe", "--flag", "openmausbot://cloud"]);
});

test("both schemes are registered, by the installer and at every start", () => {
  assert.deepEqual(DEEP_LINK_SCHEMES, ["arkobot", "openmausbot"]);
  assert.match(readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8"), /^ {4}schemes: \[arkobot, openmausbot\]\r?$/m);
  const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.match(main, /for \(const scheme of DEEP_LINK_SCHEMES\) app\.setAsDefaultProtocolClient\(scheme\)/);
  assert.match(main, /^import "\.\/startup-identity\.mjs";\r?\n/, "the profile, AppUserModelId and env aliases come before any other import");
});
