// The edge relay (node-agent/edges.ts): accepts TCP on RELAY_PORT and pipes each connection, byte for byte, to
// RELAY_TARGET (a customer VPS's port 443). It never reads the stream: TLS ends on the customer's VPS.
import { createConnection, createServer } from "node:net";
import { pathToFileURL } from "node:url";

export function relayTarget(env: NodeJS.ProcessEnv): { host: string; port: number; listen: number } {
  const match = /^((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})$/.exec(env.RELAY_TARGET?.trim() ?? "");
  if (!match) throw new Error("RELAY_TARGET precisa ser ip:porta");
  const listen = Number(env.RELAY_PORT ?? 8443);
  return { host: match[1]!, port: Number(match[2]), listen };
}

export function startRelay(target: { host: string; port: number; listen: number }) {
  const server = createServer((client) => {
    const upstream = createConnection({ host: target.host, port: target.port });
    upstream.setTimeout(30_000, () => upstream.destroy());
    upstream.once("connect", () => upstream.setTimeout(0));
    client.pipe(upstream);
    upstream.pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close);
    upstream.on("error", close);
    client.on("close", close);
    upstream.on("close", close);
  });
  server.listen(target.listen);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = relayTarget(process.env);
  const server = startRelay(target);
  console.log(`[arkobot-relay] :${target.listen} → ${target.host}:${target.port}`);
  const stop = () => server.close(() => process.exit(0));
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
