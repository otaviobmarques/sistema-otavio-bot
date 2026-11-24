import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ICNS_TYPES, outputs } from "../arkobot-icons.mjs";

const root = new URL("../../", import.meta.url);
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

describe("the ArkoBot icons", () => {
  it("are what docs/arkobot/mark.svg gives (node scripts/arkobot-icons.mjs rewrites them)", () => {
    for (const [path, data] of outputs()) expect(readFileSync(new URL(path, root)).equals(data), path).toBe(true);
  });

  it("come in the sizes and formats the installers and the web app need", () => {
    expect(pngSize(readFileSync(new URL("build/icon-1024.png", root)))).toEqual([1024, 1024]);
    expect(pngSize(readFileSync(new URL("electron/resources/app-icon.png", root)))).toEqual([1024, 1024]);
    const ico = readFileSync(new URL("build/icon.ico", root));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico.readUInt8(6 + index * 16) || 256);
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));
    const icns = readFileSync(new URL("build/icon.icns", root));
    expect(icns.subarray(0, 4).toString("latin1")).toBe("icns");
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    const types: string[] = [];
    for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) types.push(icns.subarray(at, at + 4).toString("latin1"));
    expect(types).toEqual(ICNS_TYPES.map(([type]) => type));
    expect(readFileSync(new URL("build/icon.svg", root), "utf8")).toContain('viewBox="0 0 1024 1024"');
  });
});
