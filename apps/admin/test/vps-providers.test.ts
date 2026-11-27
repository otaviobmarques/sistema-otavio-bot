import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ContaboProvider } from "../src/computers/contabo.ts";
import { HetznerProvider } from "../src/computers/hetzner.ts";
import { HostingerProvider } from "../src/computers/hostinger.ts";
import { AGENT_IMAGE, postInstallScript } from "../src/computers/post-install.ts";
import { VpsProviderError } from "../src/computers/provider.ts";
import { relayTarget } from "../src/node-agent/relay.ts";

interface Seen {
  method: string;
  url: string;
  headers: Headers;
  body: string;
}

/** A provider API in memory: the routes answer what the docs say; every request is kept. Nothing leaves the process. */
function fakeFetch(routes: Record<string, (seen: Seen) => Response>) {
  const seen: Seen[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const entry = { method: init?.method ?? "GET", url, headers: new Headers(init?.headers), body: String(init?.body ?? "") };
    seen.push(entry);
    const path = new URL(url).pathname;
    const handler = routes[`${entry.method} ${path}`];
    if (!handler) return Response.json({ message: `no route ${entry.method} ${path}` }, { status: 404 });
    return handler(entry);
  }) as typeof fetch;
  return { fetcher, seen };
}

const order = { label: "arkobot-cliente-12345678", planRef: "cx23", regionRef: "fsn1", imageRef: null, script: "#!/bin/bash\necho oi\n" };

describe("provedores de VPS (contra APIs falsas)", () => {
  it("Hetzner: cria com cloud-init, lê o IP, e cancelar apaga o servidor", async () => {
    const { fetcher, seen } = fakeFetch({
      "POST /v1/servers": () => Response.json({ server: { id: 42, name: "arkobot-cliente-12345678", status: "initializing", public_net: { ipv4: { ip: "203.0.113.4" } } }, root_password: null }, { status: 201 }),
      "GET /v1/servers/42": () => Response.json({ server: { id: 42, status: "running", public_net: { ipv4: { ip: "203.0.113.4" } } } }),
      "DELETE /v1/servers/42": () => Response.json({ action: { id: 1, status: "running" } }),
    });
    const provider = new HetznerProvider("hz-token-secreto", fetcher);
    const result = await provider.order(order);
    expect(result).toMatchObject({ orderRef: "42", machine: { id: "42", phase: "installing", ipv4: "203.0.113.4" }, imageRef: "ubuntu-24.04" });
    const body = JSON.parse(seen[0]!.body);
    expect(body).toMatchObject({ name: "arkobot-cliente-12345678", server_type: "cx23", image: "ubuntu-24.04", location: "fsn1", user_data: order.script });
    expect(body.ssh_keys).toBeUndefined();
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer hz-token-secreto");
    expect((await provider.status({ vmId: "42", subscriptionRef: null }))?.phase).toBe("running");
    expect(provider.deletesOnCancel).toBe(true);
    await provider.cancel({ vmId: "42", subscriptionRef: null });
    expect(seen.at(-1)!.method).toBe("DELETE");
  });

  it("Hetzner: erro do provedor não repete o token e a recusa é clara", async () => {
    const { fetcher } = fakeFetch({
      "POST /v1/servers": () => Response.json({ error: { code: "invalid_input", message: "server type cx23 not available" } }, { status: 422 }),
    });
    const error = await new HetznerProvider("hz-token-secreto", fetcher).order(order).catch((e) => e);
    expect(error).toBeInstanceOf(VpsProviderError);
    expect(error).toMatchObject({ status: 422, ambiguous: false, message: "Hetzner: server type cx23 not available" });
    expect(String(error.message)).not.toContain("hz-token");
  });

  it("Hostinger: script guardado, compra com setup, 202 sem máquina, renovação desligada", async () => {
    const { fetcher, seen } = fakeFetch({
      "GET /api/vps/v1/templates": () => Response.json([{ id: 7, name: "Ubuntu 24.04" }, { id: 1121, name: "Ubuntu 24.04 with Docker" }]),
      "GET /api/vps/v1/data-centers": () => Response.json([{ id: 19, location: "us" }, { id: 31, location: "br" }]),
      "POST /api/vps/v1/post-install-scripts": () => Response.json({ id: 555 }),
      "POST /api/vps/v1/virtual-machines": () => Response.json({ id: 9, subscription_id: "Azz1", status: "payment_initiated" }, { status: 202 }),
      "GET /api/vps/v1/virtual-machines": () => Response.json([{ id: 77, subscription_id: "Azz1", state: "initial", ipv4: [{ id: 1, address: "203.0.113.9" }] }]),
      "DELETE /api/billing/v1/subscriptions/Azz1/auto-renewal/disable": () => Response.json({ id: "Azz1", status: "not_renewing", is_auto_renewed: false, expires_at: "2026-12-27T00:00:00Z" }),
    });
    const provider = new HostingerProvider("hs-token", fetcher);
    const result = await provider.order({ ...order, planRef: "hostingercombr-vps-kvm1-brl-1m", regionRef: null });
    expect(result).toEqual({ orderRef: "9", subscriptionRef: "Azz1", machine: null, regionRef: "31", imageRef: "1121", scriptRef: "555" });
    const purchase = JSON.parse(seen.find((s) => s.method === "POST" && s.url.endsWith("/virtual-machines"))!.body);
    expect(purchase).toEqual({ item_id: "hostingercombr-vps-kvm1-brl-1m", setup: { template_id: 1121, data_center_id: 31, post_install_script_id: 555, install_monarx: false, enable_backups: false } });
    const vm = await provider.status({ vmId: null, subscriptionRef: "Azz1" });
    expect(vm).toMatchObject({ id: "77", phase: "needs_setup", ipv4: "203.0.113.9" });
    expect(await provider.cancel({ vmId: "77", subscriptionRef: "Azz1" })).toEqual({ autoRenew: false, expiresAt: "2026-12-27T00:00:00Z" });
  });

  it("Hostinger: compra recusada apaga o script guardado; sem resposta é incerta", async () => {
    const deleted: string[] = [];
    const { fetcher } = fakeFetch({
      "POST /api/vps/v1/post-install-scripts": () => Response.json({ id: 556 }),
      "POST /api/vps/v1/virtual-machines": () => Response.json({ message: "Payment method declined" }, { status: 422 }),
      "DELETE /api/vps/v1/post-install-scripts/556": (s) => { deleted.push(s.url); return Response.json({}); },
    });
    const error = await new HostingerProvider("t", fetcher).order({ ...order, regionRef: "31", imageRef: "1121" }).catch((e) => e);
    expect(error).toMatchObject({ ambiguous: false, message: "Hostinger: Payment method declined" });
    expect(deleted).toHaveLength(1);
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const lost = await new HostingerProvider("t", down).cancel({ vmId: null, subscriptionRef: "x" }).catch((e) => e);
    expect(lost).toMatchObject({ ambiguous: true, status: null });
  });

  it("Contabo: login do usuário da API, x-request-id em cada chamada, cancelamento no fim do período", async () => {
    let logins = 0;
    const { fetcher, seen } = fakeFetch({
      "POST /auth/realms/contabo/protocol/openid-connect/token": (s) => {
        logins++;
        const form = new URLSearchParams(s.body);
        expect(form.get("grant_type")).toBe("password");
        expect(form.get("username")).toBe("api@domma.com.br");
        return Response.json({ access_token: "ct-access", expires_in: 300 });
      },
      "GET /v1/compute/images": () => Response.json({ data: [{ imageId: "afecbb85-e2fc-46f0-9684-b46b1faf00bb", name: "ubuntu-24.04" }] }),
      "POST /v1/compute/instances": () => Response.json({ data: [{ instanceId: 100200, status: "provisioning", productId: "V91", region: "US-east" }] }, { status: 201 }),
      "GET /v1/compute/instances/100200": () => Response.json({ data: [{ instanceId: 100200, status: "running", ipConfig: { v4: { ip: "203.0.113.20" } } }] }),
      "POST /v1/compute/instances/100200/cancel": () => Response.json({ data: [{ instanceId: 100200, cancelDate: "2027-01-31" }] }),
    });
    const provider = new ContaboProvider({ clientId: "cid", clientSecret: "csecret", apiUser: "api@domma.com.br", apiPassword: "senha" }, fetcher,
      "https://api.contabo.test/v1", "https://auth.contabo.test/auth/realms/contabo/protocol/openid-connect/token");
    const result = await provider.order({ ...order, planRef: "V91", regionRef: "US-east" });
    expect(result).toMatchObject({ orderRef: "100200", subscriptionRef: "100200", machine: { phase: "installing" }, imageRef: "afecbb85-e2fc-46f0-9684-b46b1faf00bb" });
    const create = seen.find((s) => s.method === "POST" && s.url.endsWith("/compute/instances"))!;
    expect(JSON.parse(create.body)).toMatchObject({ productId: "V91", region: "US-east", userData: order.script, period: 1 });
    expect(create.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect((await provider.status({ vmId: "100200", subscriptionRef: null }))).toMatchObject({ phase: "running", ipv4: "203.0.113.20" });
    expect(await provider.cancel({ vmId: "100200", subscriptionRef: null })).toEqual({ autoRenew: false, expiresAt: "2027-01-31" });
    expect(logins, "the access token is reused").toBe(1);
  });
});

describe("script de primeira inicialização", () => {
  const base = { adminUrl: "https://admin.arkobot.com.br", machineId: "0b1f8e9a-1111-4222-8333-944455556666", enrollToken: `arko_enroll_${"A".repeat(43)}`,
    edgeIp: "200.141.20.53", acmeEmail: "admin@arkobot.com.br", sshKeys: ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyDataExampleKeyDataXYZ operador@domma"] };

  it("instala Docker, Traefik e o agente, fecha a 443 para a borda e nunca leva o token do nó", () => {
    const script = postInstallScript(base);
    expect(script.startsWith("#!/bin/bash\n")).toBe(true);
    expect(script).toContain("get.docker.com");
    expect(script).toContain("/api/agent/v1/enroll");
    expect(script).toContain("--certificatesresolvers.letsencrypt.acme.tlschallenge=true");
    expect(script).toContain("! -s $EDGE_IP -j DROP");
    expect(script).toContain(base.sshKeys[0]);
    expect(script).not.toMatch(/arko_node_[A-Za-z0-9_-]{43}/);
    expect(script.length).toBeLessThan(48 * 1024);
  });

  it("usa a mesma imagem e o mesmo socket do compose do agente", () => {
    const compose = readFileSync(new URL("../deploy/node-agent.vps.compose.yml", import.meta.url), "utf8");
    expect(compose).toContain(`image: ${AGENT_IMAGE}`);
    expect(postInstallScript(base)).toContain("/var/run/docker.sock:/var/run/docker.sock\n");
  });

  it("recusa valores que quebrariam o shell", () => {
    expect(() => postInstallScript({ ...base, machineId: "x'; rm -rf / #" })).toThrow();
    expect(() => postInstallScript({ ...base, sshKeys: ["ssh-ed25519 AAAA'$(reboot)'"] })).toThrow();
  });

  it("o repasse da borda só aceita ip:porta", () => {
    expect(relayTarget({ RELAY_TARGET: "198.51.100.1:443" })).toEqual({ host: "198.51.100.1", port: 443, listen: 8443 });
    expect(() => relayTarget({ RELAY_TARGET: "evil.example:443" })).toThrow();
  });
});
