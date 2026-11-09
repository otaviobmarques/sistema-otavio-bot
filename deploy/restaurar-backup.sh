#!/usr/bin/env bash
# Puts an archive made by backup.sh back into the Otávio Bot data volume.
# Run as root from the deploy folder:
#   sudo ./restaurar-backup.sh /var/backups/otavio-bot/otavio-bot-AAAA-MM-DD-HHMM.tar.gz
# The stack is stopped, what is in the volume now is saved first as one more
# archive (so a restore can itself be undone), then the volume is replaced.
set -euo pipefail
cd "$(dirname "$0")"
archive="${1:-}"
[ "$(id -u)" = 0 ] || { echo "rode como root: sudo ./restaurar-backup.sh ARQUIVO" >&2; exit 1; }
[ -f "$archive" ] || { echo "uso: sudo ./restaurar-backup.sh /var/backups/otavio-bot/otavio-bot-....tar.gz" >&2; exit 1; }
gzip -t "$archive" || { echo "$archive não é um backup válido" >&2; exit 1; }

container="$(docker compose ps -a -q omb || true)"
volume=""
[ -n "$container" ] && volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")"
volume="${volume:-${COMPOSE_PROJECT_NAME:-otavio-bot}_data}"

printf 'Isto troca TODOS os dados do Otávio Bot (volume %s) pelo backup\n  %s\nDigite SIM para continuar: ' "$volume" "$archive"
read -r answer
[ "$answer" = SIM ] || { echo "nada foi alterado"; exit 1; }

docker compose stop
docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
target="$(docker volume inspect -f '{{.Mountpoint}}' "$volume")"
BACKUP_PAUSE=0 ./backup.sh
find "$target" -mindepth 1 -delete
tar --extract --gzip --same-owner --numeric-owner --file "$archive" --directory "$target"
docker compose up -d
echo "restaurado: $archive. O estado anterior ficou salvo como o backup mais recente acima."
