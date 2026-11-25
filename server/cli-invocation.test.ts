import { describe, expect, it } from "vitest";

import { cliCommand, cliPrefix } from "./cli-invocation.ts";

describe("cliPrefix", () => {
  it("prints commands the way the CLI was started", () => {
    expect(cliPrefix({}, "/home/me/.npm/_npx/1a2b/node_modules/openmausbot/dist-server/openmausbot.js")).toBe("npx openmausbot");
    expect(cliPrefix({ npm_command: "exec" }, "/repo/node_modules/vitest/vitest.mjs"), "another tool run by npx").toBe("arkobot");
    expect(cliPrefix({ npm_lifecycle_event: "omb" }, "/repo/server/openmausbot.ts")).toBe("pnpm omb");
    expect(cliPrefix({ OMB_CLI_PREFIX: "docker compose exec omb arkobot" }, "/app/dist-server/openmausbot.js")).toBe("docker compose exec omb arkobot");
    expect(cliPrefix({}, "/usr/lib/node_modules/openmausbot/dist-server/openmausbot.js"), "the bundle run by path").toBe("arkobot");
    expect(cliCommand("pair", {}, "C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\9\\node_modules\\openmausbot\\x.js")).toBe("npx openmausbot pair");
  });

  it("answers by the name the command was typed as: arkobot, or its first name openmausbot, which keeps working", () => {
    expect(cliPrefix({}, "/usr/local/bin/arkobot")).toBe("arkobot");
    expect(cliPrefix({}, "/usr/local/bin/openmausbot")).toBe("openmausbot");
    expect(cliPrefix({}, "C:\\Users\\me\\AppData\\Roaming\\npm\\arkobot.cmd")).toBe("arkobot");
    expect(cliPrefix({}, "C:\\Users\\me\\AppData\\Roaming\\npm\\openmausbot.ps1")).toBe("openmausbot");
    expect(cliCommand("pair", {}, "/home/me/.local/bin/arkobot")).toBe("arkobot pair");
  });
});
