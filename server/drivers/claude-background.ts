import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCli } from "../procs.ts";

type BackgroundFlag = "--tools" | "--no-session-persistence" | "--strict-mcp-config" | "--setting-sources";

export const BACKGROUND_CALL_TIMEOUT_MS = 60_000;

/** No extended thinking and none of the person's hooks. Claude CLI 2.1.303: only this setting keeps Haiku 5.5 from thinking;
 * MAX_THINKING_TOKENS=0 still left it thinking on about half the calls, and any --effort turns thinking back on. */
export const BACKGROUND_SETTINGS = JSON.stringify({ alwaysThinkingEnabled: false, disableAllHooks: true });

/** Isolated like a turn (no MCP servers, user or local settings) and with no built-in tools, each flag only where the CLI accepts it. */
export function backgroundCallArgs(input: {
  model: string;
  outputFormat: "json" | "text";
  supports: (flag: BackgroundFlag) => boolean;
  /** False while OMB_CLAUDE_INHERIT_USER_CONFIG asks for the person's own setup. */
  isolated: boolean;
}): string[] {
  const args = ["-p", "--model", input.model, "--output-format", input.outputFormat, "--settings", BACKGROUND_SETTINGS];
  if (input.supports("--tools")) args.push("--tools", "");
  if (input.supports("--no-session-persistence")) args.push("--no-session-persistence");
  if (input.isolated) {
    if (input.supports("--strict-mcp-config")) args.push("--strict-mcp-config");
    if (input.supports("--setting-sources")) args.push("--setting-sources", "project");
  }
  return args;
}

/** Claude CLI: `--input-format stream-json` requires `--output-format stream-json`, which requires `--verbose` with -p. */
export function withImageInput(args: string[], images: readonly unknown[] | undefined): string[] {
  if (!images?.length) return args;
  const out = [...args];
  const at = out.indexOf("--output-format");
  if (at >= 0) out[at + 1] = "stream-json";
  return [...out, "--input-format", "stream-json", "--verbose"];
}

/** The last `result` event of a stream-json run, as the JSON text `--output-format json` would have printed. */
export function streamResultLine(stdout: string): string {
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      if ((JSON.parse(lines[i]!) as { type?: unknown }).type === "result") return lines[i]!;
    } catch {}
  }
  return "";
}

/** Runs in an empty temp folder so no project settings or files leak in; the caller removes it once settled. */
export function spawnBackgroundCall(cli: string, args: string[], env: NodeJS.ProcessEnv) {
  const cwd = mkdtempSync(join(tmpdir(), "omb-claude-background-"));
  const removeCwd = () => { try { rmSync(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} };
  try {
    return { child: spawnCli(cli, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env, botWork: true }), removeCwd };
  } catch (error) {
    removeCwd();
    throw error;
  }
}
