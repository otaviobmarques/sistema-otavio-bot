// ArkoBot is the name people read; the upstream OpenMausBot identifiers below are machinery that other programs, data
// already on people's computers and the iOS app depend on. A rebrand changes the name, never these.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { DEFAULT_BRAND } from "../../server/brand.ts";
import { phoneSecretAAD } from "../../server/phone-secret.ts";
import { LEGACY_DEFAULT_BOT_NAME, PRODUCT_NAME } from "../../shared/product-name.ts";
import { PRODUCT_NAME as PAGE_PRODUCT_NAME } from "../../src/lib/brand.ts";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const builder = read("electron-builder.yml");
const field = (name: string) => builder.match(new RegExp(`^${name}: (.+)$`, "m"))?.[1];

describe("the product's name", () => {
  it("is ArkoBot on the server, the page and the desktop app alike", () => {
    expect(PRODUCT_NAME).toBe("ArkoBot");
    expect(PAGE_PRODUCT_NAME).toBe(PRODUCT_NAME);
    expect(DEFAULT_BRAND.name).toBe(PRODUCT_NAME);
    expect(createRequire(import.meta.url)("../../electron/product-name.cjs").PRODUCT_NAME).toBe(PRODUCT_NAME);
    expect(LEGACY_DEFAULT_BOT_NAME).toBe("MausBot");
  });

  it("is what installers show", () => {
    expect(builder).toMatch(/^ {4}CFBundleDisplayName: ArkoBot$/m);
    expect(builder).toMatch(/^ {2}shortcutName: ArkoBot$/m);
    expect(builder).toMatch(/^ {2}uninstallDisplayName: ArkoBot$/m);
    expect(builder).toMatch(/^ {6}Name: ArkoBot$/m);
  });
});

describe("identifiers that stay OpenMausBot's", () => {
  it("keeps the app id, the packaged name (the data folder on Windows), artifact names and the URL scheme", () => {
    expect(field("appId")).toBe("com.openmausbot.app");
    expect(field("productName")).toBe("OpenMausBot");
    expect(field("artifactName")).toBe("OpenMausBot-${version}-${arch}.${ext}");
    expect(builder).toMatch(/^ {2}executableName: openmausbot$/m);
    expect(builder).toMatch(/^ {4}schemes: \[openmausbot\]$/m);
  });

  it("keeps the data folder, the CLI and the package name", () => {
    expect(read("server/config.ts")).toContain('join(dataHome(), ".openmausbot")');
    expect(read("server/cli.ts")).toContain('join(homedir(), ".openmausbot")');
    expect(JSON.parse(read("package.json")).name).toBe("openmausbot");
    expect(read("scripts/build-npm-package.mjs")).toContain('bin: { openmausbot: "cli.js" }');
  });

  it("keeps the phone credential's authenticated data, which the iOS app computes too", () => {
    const aad = new TextDecoder().decode(phoneSecretAAD({ keyId: "k".repeat(22), deviceId: "d", botId: "b", threadId: "t", messageId: "m", target: "x", requestKey: "r" }));
    expect(aad.split("\n")[0]).toBe("openmausbot-phone-credential-v1");
  });

  it("keeps the cloud desktop container prefix and the Docker image", () => {
    expect(read("server/vps-computer.ts")).toContain("/^openmausbot-vps-[a-z0-9]{1,12}-[a-f0-9]{12}$/");
    expect(read("deploy/docker-compose.yml")).toContain("image: ghcr.io/otaviobmarques/sistema-otavio-bot:");
  });
});
