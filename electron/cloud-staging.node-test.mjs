import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CLOUD_ORIGIN, STAGING_CLOUD_ORIGIN, checkoutDestination, cloudOrigin, cloudTarget, createCloudAccountClient } from "./cloud-account.mjs";

const accessToken = `omc_${"S".repeat(43)}`;

test("OMB_CLOUD_STAGING=1, and only that, points the app at the fixed staging Admin with its own token file", () => {
  assert.deepEqual(cloudTarget({}), { origin: CLOUD_ORIGIN, staging: false, file: "cloud-account.bin", saved: "cloud-accounts.bin", places: "account-places.json", environments: "environments.json", sync: "cloud-sync", look: "cloud-home-look.json" });
  assert.deepEqual(cloudTarget({ OMB_CLOUD_STAGING: "1" }), { origin: "https://cloud-staging.arkobot.invalid", staging: true, file: "cloud-account-staging.bin", saved: "cloud-accounts-staging.bin", places: "account-places-staging.json",
    environments: "environments-staging.json", sync: "cloud-sync-staging", look: "cloud-home-look-staging.json" });
  const production = Object.values(cloudTarget({})), staging = Object.values(cloudTarget({ OMB_CLOUD_STAGING: "1" }));
  assert.ok(staging.filter(value => typeof value === "string").every(name => !production.includes(name)), "no file or address shared with production");
  assert.equal(STAGING_CLOUD_ORIGIN, "https://cloud-staging.arkobot.invalid");
  for (const value of ["0", "true", "yes", " 1", "1 ", "01", "2", "", "https://evil.example.test", "https://cloud-staging.arkobot.invalid"]) {
    assert.deepEqual(cloudTarget({ OMB_CLOUD_STAGING: value }), cloudTarget({}), JSON.stringify(value));
  }
  assert.deepEqual(cloudTarget({ OMB_CLOUD_ORIGIN: "https://evil.example.test", OMB_CLOUD_STAGING_URL: "https://evil.example.test" }), cloudTarget({}), "no address is ever read from the environment");
  assert.deepEqual(cloudTarget(undefined).origin, process.env.OMB_CLOUD_STAGING === "1" ? STAGING_CLOUD_ORIGIN : CLOUD_ORIGIN);
});

test("the staging address is the one exact https origin; staging checkouts are only Dodo's test page", () => {
  assert.equal(cloudOrigin(STAGING_CLOUD_ORIGIN), STAGING_CLOUD_ORIGIN);
  for (const value of ["http://cloud-staging.arkobot.invalid", `${STAGING_CLOUD_ORIGIN}/`, `${STAGING_CLOUD_ORIGIN}:8443`, "https://cloud-staging.arkobot.invalid.evil.test", "https://omb-cloud-staging.fly.dev"]) {
    assert.throws(() => cloudOrigin(value), /Invalid ArkoBot Cloud address/, value);
  }
  const test = "https://test.checkout.dodopayments.com/session/cks_1", live = "https://checkout.dodopayments.com/session/cks_1";
  assert.equal(checkoutDestination(test, { staging: true }), test);
  assert.equal(checkoutDestination(live, { staging: true }), null, "staging never opens a live checkout");
  assert.equal(checkoutDestination(test), null, "production never opens a test checkout");
  assert.equal(checkoutDestination(live), live);
  assert.equal(checkoutDestination(`${test}#x`, { staging: true }), null);
});

test("neither the staging nor the production Admin is ever contacted, and the Plan page is the ArkoBot customer area", async () => {
  const requests = [], browsers = [], states = [];
  let saved = null;
  const fetch = async url => {
    requests.push(url);
    return new Response(JSON.stringify({ cloudContractVersion: 1, attempt: "b".repeat(43), expiresIn: 600, resendAfter: 30, accessToken }), { status: 200 });
  };
  const client = createCloudAccountClient({ origin: cloudTarget({ OMB_CLOUD_STAGING: "1" }).origin, fetch, deviceName: "Staging VM", platform: "linux", appVersion: "0.1.113",
    store: { read: async () => saved, write: async value => { saved = value; } }, openBrowser: async url => { browsers.push(url); }, onState: state => states.push(state),
    setTimer: () => 1, clearTimer: () => {} });
  try {
    assert.equal((await client.start()).staging, true, "the page can tell it is staging from the first state");
    assert.equal((await client.emailStart("tester@example.test")).outcome, "failed");
    assert.equal(saved, null);
    assert.ok(states.every(state => state.staging === true));
  } finally { client.close(); }
  const production = createCloudAccountClient({ fetch, deviceName: "Mac", platform: "darwin", store: { read: async () => null, write: async () => {} }, openBrowser: async url => { browsers.push(url); }, setTimer: () => 1, clearTimer: () => {} });
  try {
    assert.equal("staging" in (await production.start()), false, "production states never carry the marker");
    assert.equal((await production.emailStart("tester@example.test")).outcome, "failed");
    assert.equal((await production.checkout("pro", "app_menu")).outcome, "signing-in");
    assert.equal(production.state().status, "signed-out");
    await production.openDashboard();
  } finally { production.close(); }
  assert.deepEqual(requests, [], "no Cloud Admin is ever contacted");
  assert.deepEqual(browsers, ["https://conta.arkobot.com.br"], "the Plan page is the ArkoBot customer area");
});

test("main keeps each Admin's sign-in, saved servers, Files state and Cloud name in their own files, and gives the client the chosen Admin", () => {
  const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(main, /function environmentsFile\(\) \{\n  return path\.join\(app\.getPath\("userData"\), cloudTarget\(process\.env\)\.environments\);/);
  assert.match(main, /stateDir: cloudTarget\(process\.env\)\.sync,/);
  assert.match(main, /lookFile\(\(\) => path\.join\(app\.getPath\("userData"\), cloudTarget\(process\.env\)\.look\), fs\)/);
  for (const name of ['"environments.json"', '"cloud-home-look.json"']) assert.equal(main.includes(name), false, `no fixed ${name}`);
  const ensure = main.slice(main.indexOf("function ensureCloudAccount() {"), main.indexOf("\n}\n", main.indexOf("function ensureCloudAccount() {")));
  assert.match(ensure, /store: cloudAccountStore\(\),/);
  assert.match(main, /const cloudAccountStore = \(\) => \(activeSignIn \?\?= createCloudAccountStore\(\{ file: path\.join\(app\.getPath\("userData"\), cloudTarget\(process\.env\)\.file\)/);
  assert.match(main, /createCloudAccountStore\(\{ file: path\.join\(app\.getPath\("userData"\), cloudTarget\(process\.env\)\.saved\)/);
  assert.match(ensure, /origin: cloudTarget\(process\.env\)\.origin,/);
  assert.equal(main.includes('"cloud-account.bin"'), false, "no second, fixed token file");
});
