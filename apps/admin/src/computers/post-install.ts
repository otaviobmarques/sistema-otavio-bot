// The script a new customer VPS runs once after Hostinger installs it (saved as /post_install, output in
// /post_install.log). It holds no lasting secret: only a single-purpose enrollment token that expires in a day and that
// the Admin swaps for the node token over HTTPS. It sets up Traefik (TLS for the customer's address, by TLS-ALPN through
// the shared edge's passthrough) and the same node agent as apps/admin/deploy/node-agent.vps.compose.yml.

export const AGENT_IMAGE = "ghcr.io/otaviobmarques/arkobot-node-agent:latest";
/** Docker Engine 29 refuses API versions below 1.44; Traefik talks to it from v3.6.1 on. */
export const TRAEFIK_IMAGE = "traefik:v3.6.2";
export const DEDICATED_TRAEFIK_CONTAINER = "arkobot-traefik";
export const INSTANCE_NETWORK = "arkobot-instances";

export interface PostInstallInput {
  adminUrl: string;
  machineId: string;
  enrollToken: string;
  /** The shared edge's address: the only source allowed on port 443. Null leaves 443 open. */
  edgeIp: string | null;
  acmeEmail: string;
  /** The operator's SSH public keys, added to root's authorized_keys. */
  sshKeys: string[];
}

const SSH_KEY = /^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/=]{40,}(?: [A-Za-z0-9@._-]{1,100})?$/;

function sshKeysBlock(keys: string[]): string {
  if (!keys.length) return "";
  for (const key of keys) if (!SSH_KEY.test(key)) throw new Error("chave SSH inválida em VPS_SSH_PUBLIC_KEYS");
  return `install -d -m 700 /root/.ssh
cat >> /root/.ssh/authorized_keys <<'KEYS'
${keys.join("\n")}
KEYS
chmod 600 /root/.ssh/authorized_keys
`;
}

const SAFE = /^[A-Za-z0-9._:/@+-]+$/;

function shellValue(name: string, value: string): string {
  if (!SAFE.test(value)) throw new Error(`valor inválido para ${name} no script de instalação`);
  return value;
}

export function postInstallScript(input: PostInstallInput): string {
  const admin = shellValue("ARKO_ADMIN_URL", new URL(input.adminUrl).origin);
  const machine = shellValue("machineId", input.machineId);
  const enroll = shellValue("enrollToken", input.enrollToken);
  const email = shellValue("acmeEmail", input.acmeEmail);
  const edge = input.edgeIp ? shellValue("edgeIp", input.edgeIp) : "";
  return `#!/bin/bash
# ArkoBot: computador próprio do cliente. Gerado pelo Admin; roda uma vez depois da instalação.
set -euo pipefail
ADMIN='${admin}'
MACHINE='${machine}'
ENROLL='${enroll}'
EDGE_IP='${edge}'

${sshKeysBlock(input.sshKeys)}if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

RESP=''
for attempt in $(seq 1 60); do
  if RESP=$(curl -fsS --max-time 30 -X POST "$ADMIN/api/agent/v1/enroll" -H 'content-type: application/json' \\
      -d "{\\"machineId\\":\\"$MACHINE\\",\\"enrollToken\\":\\"$ENROLL\\"}"); then break; fi
  RESP=''
  sleep 30
done
[ -n "$RESP" ] || { echo 'inscrição no Admin falhou'; exit 1; }
field() { printf '%s' "$RESP" | sed -n "s/.*\\"$1\\":\\"\\([^\\"]*\\)\\".*/\\1/p"; }
TOKEN=$(field token)
REG_USER=$(field registryUser)
REG_TOKEN=$(field registryToken)
case "$TOKEN" in arko_node_*) ;; *) echo 'resposta da inscrição sem token'; exit 1 ;; esac
if [ -n "$REG_USER" ] && [ -n "$REG_TOKEN" ]; then printf '%s' "$REG_TOKEN" | docker login ghcr.io -u "$REG_USER" --password-stdin; fi

docker network inspect ${INSTANCE_NETWORK} >/dev/null 2>&1 || docker network create ${INSTANCE_NETWORK}
install -d -m 700 /opt/arkobot/traefik /opt/arkobot/node-agent
touch /opt/arkobot/traefik/acme.json && chmod 600 /opt/arkobot/traefik/acme.json

cat > /opt/arkobot/traefik/compose.yml <<'YAML'
name: arkobot-traefik
services:
  traefik:
    image: ${TRAEFIK_IMAGE}
    container_name: ${DEDICATED_TRAEFIK_CONTAINER}
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --providers.docker.network=${INSTANCE_NETWORK}
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
      - --certificatesresolvers.letsencrypt.acme.email=${email}
      - --certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json
    ports: ["443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /opt/arkobot/traefik/acme.json:/acme/acme.json
    networks: [${INSTANCE_NETWORK}]
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
networks:
  ${INSTANCE_NETWORK}: { external: true }
YAML

cat > /opt/arkobot/node-agent/compose.yml <<'YAML'
name: arkobot-node-agent
services:
  agent:
    image: ${AGENT_IMAGE}
    pull_policy: always
    restart: unless-stopped
    env_file: .env
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    mem_limit: 256m
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
YAML

umask 077
printf 'ARKO_ADMIN_URL=%s\\nARKO_NODE_TOKEN=%s\\nARKO_TRAEFIK_CONTAINER=${DEDICATED_TRAEFIK_CONTAINER}\\n' "$ADMIN" "$TOKEN" > /opt/arkobot/node-agent/.env
if [ -n "$REG_USER" ] && [ -n "$REG_TOKEN" ]; then printf 'ARKO_REGISTRY_USER=%s\\nARKO_REGISTRY_TOKEN=%s\\n' "$REG_USER" "$REG_TOKEN" >> /opt/arkobot/node-agent/.env; fi
unset TOKEN REG_TOKEN RESP

if [ -n "$EDGE_IP" ]; then
  # Portas publicadas pelo Docker passam por fora do ufw: a regra vai na cadeia DOCKER-USER, refeita a cada boot.
  cat > /etc/systemd/system/arkobot-firewall.service <<UNIT
[Unit]
Description=ArkoBot: porta 443 só para a borda compartilhada
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'iptables -C DOCKER-USER -p tcp -m conntrack --ctorigdstport 443 ! -s $EDGE_IP -j DROP 2>/dev/null || iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 443 ! -s $EDGE_IP -j DROP'
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
fi

docker compose -f /opt/arkobot/traefik/compose.yml up -d
docker compose -f /opt/arkobot/node-agent/compose.yml up -d
if [ -n "$EDGE_IP" ]; then systemctl enable --now arkobot-firewall.service; fi
echo 'ArkoBot: pronto'
`;
}
