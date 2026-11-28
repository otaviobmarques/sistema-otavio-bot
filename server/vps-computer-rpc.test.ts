import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

import { VpsMcpSessions, vpsComputerRpc, type VpsTarget } from "./vps-computer-rpc.ts";

/** A stand-in for vps-container-mcp: an MCP server on stdio that records what it was asked. */
const FAKE_BRIDGE = `
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue;
    let result;
    if (msg.method === "initialize") result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } };
    else if (msg.method === "tools/list") result = { tools: [{ name: "screenshot", inputSchema: { type: "object" } }] };
    else if (msg.method === "tools/call" && msg.params.name === "slow") continue;
    else if (msg.method === "tools/call") result = { content: [{ type: "text", text: "ran " + msg.params.name + " on " + process.argv[1] }] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
  }
});
`;

const target: VpsTarget = { alias: "arko-c1", container: "openmausbot-vps-bot1" };

function sessions() {
  const spawned: VpsTarget[] = [];
  const pool = new VpsMcpSessions((t) => {
    spawned.push(t);
    return spawn(process.execPath, ["-e", FAKE_BRIDGE, t.container], { stdio: ["pipe", "pipe", "pipe"] });
  });
  return { pool, spawned };
}

const open = { held: false };
const deps = (pool: VpsMcpSessions, gate = async () => open as { held: boolean; blockedReason?: string }) => ({
  sessions: pool, target, budgetMs: 5_000, gate, refusal: (c: { blockedReason?: string }) => c.blockedReason ?? "held", assertActive: () => {},
});

describe("a boxed turn's VPS computer, relayed by the server", () => {
  it("lists and calls through one bridge per container", async () => {
    const { pool, spawned } = sessions();
    try {
      expect(await vpsComputerRpc({ method: "tools/list" }, deps(pool))).toEqual({ tools: [{ name: "screenshot", inputSchema: { type: "object" } }] });
      expect(await vpsComputerRpc({ method: "tools/call", params: { name: "click", arguments: {} } }, deps(pool)))
        .toEqual({ content: [{ type: "text", text: "ran click on openmausbot-vps-bot1" }] });
      expect(spawned).toEqual([target]);
    } finally { pool.closeAll(); }
  });

  it("asks the person's control gate before a call, and a held computer runs nothing", async () => {
    const { pool, spawned } = sessions();
    try {
      const held = await vpsComputerRpc({ method: "tools/call", params: { name: "click" } }, deps(pool, async () => ({ held: true, blockedReason: "A person is using it." })));
      expect(held).toEqual({ isError: true, content: [{ type: "text", text: "A person is using it." }] });
      expect(spawned).toEqual([]);
    } finally { pool.closeAll(); }
  });

  it("a call that does not answer in time says so, without claiming it did not run", async () => {
    const { pool } = sessions();
    try {
      const late = await vpsComputerRpc({ method: "tools/call", params: { name: "slow" } }, { ...deps(pool), budgetMs: 300 }) as { isError: boolean; content: { text: string }[] };
      expect(late.isError).toBe(true);
      expect(late.content[0]!.text).toMatch(/may still have run/);
    } finally { pool.closeAll(); }
  });

  it("refuses anything but listing and calling tools", async () => {
    const { pool } = sessions();
    try {
      await expect(vpsComputerRpc({ method: "resources/list" }, deps(pool))).rejects.toMatchObject({ status: 400 });
    } finally { pool.closeAll(); }
  });
});
