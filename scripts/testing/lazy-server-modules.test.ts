// One static import anywhere makes esbuild run the module when the bundle loads, so each of these stays a first-use import.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const FIRST_USE_ONLY = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](tar|undici|@hpke\/core|@whiskeysockets\/baileys)["']/m;

it("the server loads tar, undici, the phone-secret cipher and the WhatsApp library at first use", () => {
  const files = execFileSync("git", ["ls-files", "server", "shared"], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter((file) => file.endsWith(".ts") && !file.includes(".test.") && !file.includes("/testing/"));
  expect(files.filter((file) => FIRST_USE_ONLY.test(readFileSync(new URL(file, ROOT), "utf8")))).toEqual([]);
});
