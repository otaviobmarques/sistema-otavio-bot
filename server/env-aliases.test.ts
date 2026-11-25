import { describe, expect, it } from "vitest";

import * as desktop from "../electron/env-aliases.mjs";
import { stripWorkspaceCredentialEnv } from "./credential-env.ts";
import { canonicalizeEnv } from "./env-aliases.ts";

const both = [["server", canonicalizeEnv], ["desktop", desktop.canonicalizeEnv]] as const;

describe.each(both)("ARKOBOT_* settings (%s)", (_where, canonicalize) => {
  it("reach the code as the OMB_* names it reads", () => {
    const env: Record<string, string | undefined> = { ARKOBOT_PORT: "9000", ARKOBOT_DATA_DIR: "/srv/arko", PATH: "/bin" };
    canonicalize(env, "linux");
    expect(env).toEqual({ OMB_PORT: "9000", OMB_DATA_DIR: "/srv/arko", PATH: "/bin" });
  });

  it("leave every OMB_* setting working, and win over one set under both names", () => {
    const env: Record<string, string | undefined> = { OMB_PORT: "8799", OMB_PUBLIC_URL: "https://old", ARKOBOT_PUBLIC_URL: "https://new" };
    canonicalize(env, "linux");
    expect(env).toEqual({ OMB_PORT: "8799", OMB_PUBLIC_URL: "https://new" });
  });

  it("are moved, so no ARKOBOT_ copy of a credential outlives the OMB_ strip lists", () => {
    const env: Record<string, string | undefined> = { ARKOBOT_OPENAI_API_KEY: "sk-secret", ARKOBOT_CLOUD_AI_TOKEN: "t", HOME: "/h" };
    canonicalize(env, "linux");
    stripWorkspaceCredentialEnv(env);
    expect(env).toEqual({ HOME: "/h" });
  });

  it("match any letter case on Windows, replacing an OMB_ name in any case", () => {
    const env: Record<string, string | undefined> = { Arkobot_Port: "9000", omb_port: "8799" };
    canonicalize(env, "win32");
    expect(env).toEqual({ OMB_Port: "9000" });
  });

  it("match only the upper-case prefix elsewhere, and ignore a bare prefix", () => {
    const env: Record<string, string | undefined> = { arkobot_port: "9000", ARKOBOT_: "x" };
    canonicalize(env, "linux");
    expect(env).toEqual({ arkobot_port: "9000" });
  });
});
