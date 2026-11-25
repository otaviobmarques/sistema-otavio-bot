#!/usr/bin/env bash
# Puts the newest published ArkoBot image on this VPS, by itself, every half
# hour from the timer instalar-atualizador.sh installs (or by hand, as root,
# from the deploy folder:  sudo ./atualizar.sh).
#
#   - OTAVIO_BOT_VERSION fixed in .env (0.2.0, ...): nothing is updated, so
#     "voltar para a versão anterior" stays put. latest and main are followed.
#   - The stack stopped (docker compose down): nothing is started.
#   - Nothing new after the pull: exits without a word.
#   - Something new: backup.sh first (a failed backup means no update), the
#     running image kept as :anterior, up -d, then up to ATUALIZAR_TIMEOUT
#     seconds for omb to be healthy. If it is not, the previous image goes
#     back up and this version is remembered as refused, so the next runs wait
#     for a newer one instead of trying it again every half hour.
#
# The server stops on SIGTERM within stop_grace_period (docker-compose.yml):
# turns running at that moment are marked as interrupted in their threads.
set -euo pipefail
cd "$(dirname "$0")"

STATE_DIR="${ATUALIZAR_STATE_DIR:-/var/lib/otavio-bot}"
TIMEOUT="${ATUALIZAR_TIMEOUT:-300}"
INTERVAL="${ATUALIZAR_INTERVALO:-5}"
DEFAULT_IMAGE="ghcr.io/otaviobmarques/sistema-otavio-bot"

say() { echo "atualizar: $*"; }
fail() { echo "atualizar: ERRO: $*" >&2; exit 1; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || fail "ATUALIZAR_TIMEOUT tem que ser um número de segundos"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/atualizar.lock"
flock -n 9 || { say "outra atualização já está rodando; saindo"; exit 0; }

# What compose itself reads: the shell's variable first, then the last line in .env.
if [ -z "${OTAVIO_BOT_VERSION+set}" ] && [ -f .env ]; then
  OTAVIO_BOT_VERSION="$(sed -n 's/^OTAVIO_BOT_VERSION=//p' .env | tail -n 1 | tr -d "\"' \r")"
fi
pinned="${OTAVIO_BOT_VERSION:-latest}"
case "$pinned" in
  latest | main) ;;
  *)
    say "versão fixada no .env (OTAVIO_BOT_VERSION=$pinned): não atualizo. Para voltar a atualizar sozinho, use OTAVIO_BOT_VERSION=latest."
    exit 0 ;;
esac

image="$(docker compose config --images omb 2>/dev/null | head -n 1 || true)"
image="${image:-$DEFAULT_IMAGE:$pinned}"
previous_tag="${image%:*}:anterior"
refused_file="$STATE_DIR/versao-recusada"

image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
running_id() {
  local container
  container="$(docker compose ps -q "$1" 2>/dev/null | head -n 1 || true)"
  [ -n "$container" ] && docker inspect -f '{{.Image}}' "$container" 2>/dev/null || true
}
health() {
  local container
  container="$(docker compose ps -q omb 2>/dev/null | head -n 1 || true)"
  [ -n "$container" ] || { echo ausente; return; }
  docker inspect -f '{{.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo "? ?"
}
# "0.3.0 (rev. abc1234)": the version the server reports, else the image's OCI labels.
label() { docker image inspect -f "{{index .Config.Labels \"org.opencontainers.image.$2\"}}" "$1" 2>/dev/null | sed 's/^<no value>$//' || true; }
describe() {
  local id="$1" version="${2:-}" revision text
  case "$version" in "" | 0.0.0) version="$(label "$id" version)" ;; esac
  case "$version" in latest | main | 0.0.0) version="" ;; esac
  revision="$(label "$id" revision | cut -c1-7)"
  text="${version:-imagem $(printf '%s' "${id#sha256:}" | cut -c1-12)}"
  [ -z "$revision" ] || text="$text (rev. $revision)"
  printf '%s' "$text"
}
server_version() { { docker compose exec -T omb arkobot --version 2>/dev/null || docker compose exec -T omb openmausbot --version 2>/dev/null; } | tail -n 1 | tr -d '\r' || true; }
wait_healthy() {
  local want="$1" deadline=$((SECONDS + TIMEOUT)) state
  while :; do
    state="$(health)"
    if [ "${state%% *}" = "$want" ]; then
      case "${state#* }" in
        healthy) return 0 ;;
        unhealthy) return 1 ;;
      esac
    fi
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep "$INTERVAL"
  done
}

old_id="$(running_id omb)"
[ -n "$old_id" ] || { say "o servidor não está rodando (docker compose down?): não atualizo nada"; exit 0; }
old_caddy="$(running_id caddy)"

docker compose pull --quiet omb caddy || fail "não consegui baixar a imagem nova (internet ou ghcr.io fora?); nada mudou"
new_id="$(image_id "$image")"
[ -n "$new_id" ] || fail "a imagem $image não está neste VPS depois do pull"
caddy_image="$(docker compose config --images caddy 2>/dev/null | head -n 1 || true)"
new_caddy="$([ -n "$caddy_image" ] && image_id "$caddy_image" || true)"

if [ "$new_id" = "$old_id" ] && { [ -z "$old_caddy" ] || [ -z "$new_caddy" ] || [ "$new_caddy" = "$old_caddy" ]; }; then
  exit 0
fi
# Keep the image the stack runs under its tag until the update really happens, so a
# manual `docker compose up -d` in between never starts what was not checked.
put_back() { [ "$new_id" = "$old_id" ] || docker tag "$old_id" "$image"; }

if [ "$new_id" != "$old_id" ] && [ -f "$refused_file" ] && [ "$(cat "$refused_file")" = "$new_id" ]; then
  put_back
  say "a versão publicada ($(describe "$new_id")) já falhou aqui e foi desfeita; espero uma mais nova"
  exit 0
fi

old_version="$(server_version)"
old_text="$(describe "$old_id" "$old_version")"
if [ "$new_id" != "$old_id" ]; then
  say "versão nova disponível: $old_text → $(describe "$new_id")"
else
  say "Caddy novo disponível ($caddy_image)"
fi

say "fazendo backup antes de atualizar"
if ! ./backup.sh; then
  put_back
  fail "o backup falhou: não atualizei. O servidor continua em $old_text"
fi

previous_old="$(image_id "$previous_tag")"
docker tag "$old_id" "$previous_tag"
say "imagem atual guardada como $previous_tag; subindo a nova"
docker compose up -d || say "docker compose up -d falhou; confiro a saúde mesmo assim"

if wait_healthy "$new_id"; then
  rm -f "$refused_file"
  new_version="$(server_version)"
  say "atualizado: $old_text → $(describe "$new_id" "$new_version")"
  if [ -n "$previous_old" ] && [ "$previous_old" != "$old_id" ] && [ "$previous_old" != "$new_id" ]; then
    docker image rm "$previous_old" >/dev/null 2>&1 || true
  fi
  exit 0
fi

echo "atualizar: ERRO: $(describe "$new_id") não ficou saudável em ${TIMEOUT}s (estado: $(health | cut -d' ' -f2)); voltando para $old_text" >&2
docker compose logs --no-color --tail 40 omb >&2 || true
[ "$new_id" = "$old_id" ] || printf '%s\n' "$new_id" > "$refused_file"
docker tag "$old_id" "$image"
docker compose up -d || true
if wait_healthy "$old_id"; then
  fail "a atualização foi desfeita; o servidor voltou para $old_text. A versão nova não será tentada de novo; a próxima publicada será"
fi
fail "a atualização foi desfeita, mas o servidor ainda não respondeu como saudável. Veja: docker compose ps && docker compose logs --tail 100 omb"
