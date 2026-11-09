#!/usr/bin/env bash
# Lets the Otávio Bot server, running in Docker on this VPS, create and drive
# the bots' desktops on this same VPS (docs/byo-vps.md, docs/otavio-bot/VPS-24H.md).
#
# The server only ever speaks `docker -H ssh://<alias>`, so it gets what the
# desktop app on the owner's PC has: an SSH key for the `otaviobot` user (in
# the docker group) and an alias, `otaviobot-vps`, here pointing at the host
# through the Docker bridge. The key is accepted only from the stack's own
# Docker network, and the host key is written from this machine's own files
# instead of being trusted on first use.
#
# Run as root from the deploy folder, with the stack up:  sudo ./ligar-desktops.sh
# Safe to run again: it keeps an existing key and refreshes the rest.
set -euo pipefail

VPS_USER="${VPS_USER:-otaviobot}"
ALIAS="${VPS_ALIAS:-otaviobot-vps}"
KEY_NAME="otavio-bot-servidor"
cd "$(dirname "$0")"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "rode como root: sudo ./ligar-desktops.sh"
command -v docker >/dev/null || fail "Docker não encontrado neste VPS"
id "$VPS_USER" >/dev/null 2>&1 || fail "o usuário $VPS_USER não existe. Crie com: adduser --disabled-password --gecos '' $VPS_USER && usermod -aG docker $VPS_USER"
id -nG "$VPS_USER" | tr ' ' '\n' | grep -qx docker || fail "$VPS_USER não está no grupo docker. Rode: usermod -aG docker $VPS_USER"
container="$(docker compose ps -q omb)"
[ -n "$container" ] || fail "o servidor não está rodando. Rode antes: docker compose up -d"

in_server() { docker compose exec -T omb sh -ec "$1"; }

say "Chave SSH do servidor (fica no volume de dados, em /data/.ssh)"
in_server "mkdir -p ~/.ssh && chmod 700 ~/.ssh
  [ -f ~/.ssh/$KEY_NAME ] || ssh-keygen -q -t ed25519 -N '' -C $KEY_NAME -f ~/.ssh/$KEY_NAME
  chmod 600 ~/.ssh/$KEY_NAME"
public_key="$(in_server "cat ~/.ssh/$KEY_NAME.pub")"
[[ "$public_key" == ssh-ed25519\ * ]] || fail "não consegui ler a chave pública do servidor"

say "Autorizando a chave para $VPS_USER, só a partir da rede do Otávio Bot"
networks="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}' "$container")"
subnets=""
for network in $networks; do
  for subnet in $(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$network"); do
    [[ "$subnet" == *:* ]] && continue
    subnets="${subnets:+$subnets,}$subnet"
  done
done
[ -n "$subnets" ] || fail "não achei a rede Docker do servidor"
home_dir="$(getent passwd "$VPS_USER" | cut -d: -f6)"
install -d -m 700 -o "$VPS_USER" -g "$VPS_USER" "$home_dir/.ssh"
authorized="$home_dir/.ssh/authorized_keys"
touch "$authorized"
key_body="$(cut -d' ' -f1,2 <<<"$public_key")"
grep -vF "$key_body" "$authorized" > "$authorized.new" || true
printf 'from="%s",no-pty,no-agent-forwarding,no-X11-forwarding %s\n' "$subnets" "$public_key" >> "$authorized.new"
mv "$authorized.new" "$authorized"
chown "$VPS_USER:$VPS_USER" "$authorized"
chmod 600 "$authorized"
echo "aceita de: $subnets"

say "Apelido $ALIAS e chave do host (sem 'confiar no primeiro acesso')"
host_keys="$(cat /etc/ssh/ssh_host_*_key.pub 2>/dev/null | awk -v alias="$ALIAS" '{print alias, $1, $2}')"
[ -n "$host_keys" ] || fail "não achei /etc/ssh/ssh_host_*_key.pub; o OpenSSH server está instalado?"
in_server "cat > ~/.ssh/known_hosts.otavio-bot <<'EOF'
$host_keys
EOF
chmod 600 ~/.ssh/known_hosts.otavio-bot
touch ~/.ssh/config && chmod 600 ~/.ssh/config
if ! grep -qx 'Host $ALIAS' ~/.ssh/config; then
  cat >> ~/.ssh/config <<'EOF'

Host $ALIAS
  HostName host.docker.internal
  User $VPS_USER
  IdentityFile ~/.ssh/$KEY_NAME
  IdentitiesOnly yes
  HostKeyAlias $ALIAS
  UserKnownHostsFile ~/.ssh/known_hosts.otavio-bot
  StrictHostKeyChecking yes
EOF
fi"

say "Testando: o servidor fala com o Docker deste VPS por SSH"
if ! version="$(in_server "docker -H ssh://$ALIAS version --format '{{.Server.Version}}'")"; then
  fail "o servidor não conseguiu entrar por SSH no VPS. Veja se o SSH aceita conexões da rede Docker ($subnets): ufw status; e se a porta 22 escuta em todos os endereços: ss -ltnp | grep ':22 '"
fi
echo "Docker do VPS: $version"

cat <<EOF

Pronto. Falta um clique, no Otávio Bot aberto no endereço do servidor:
  Configurações -> Chaves de API -> VPS próprio -> digite  $ALIAS  -> Salvar
Depois, em cada bot: Configurações do bot -> Acesso -> computador "Nuvem" com
"VPS próprio". O primeiro desktop demora alguns minutos (a imagem é montada aqui).
EOF
