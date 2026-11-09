#!/usr/bin/env bash
# Daily backup of the Otávio Bot data volume (bots, conversations, routines,
# paired devices, engine logins). Run as root from the deploy folder, by hand
# or from the timer instalar-backup-diario.sh installs.
#
# The server is paused (not stopped) while the archive is written: what is
# copied is the state of one instant, which SQLite's journal recovers like a
# power cut, and running turns carry on after the pause. BACKUP_PAUSE=0 skips
# the pause. The archive holds the engines' logins, so it is root's alone.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then
  BACKUP_DIR="${BACKUP_DIR:-$(sed -n 's/^BACKUP_DIR=//p' .env | tail -n 1)}"
  BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(sed -n 's/^BACKUP_KEEP_DAYS=//p' .env | tail -n 1)}"
fi
BACKUP_DIR="${BACKUP_DIR:-/var/backups/otavio-bot}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_PAUSE="${BACKUP_PAUSE:-1}"
[[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "BACKUP_KEEP_DAYS must be a number of days" >&2; exit 1; }

container="$(docker compose ps -a -q omb || true)"
volume=""
[ -n "$container" ] && volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")"
volume="${volume:-${COMPOSE_PROJECT_NAME:-otavio-bot}_data}"
source_dir="$(docker volume inspect -f '{{.Mountpoint}}' "$volume")"
[ -d "$source_dir" ] || { echo "volume $volume not found" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d-%H%M)"
archive="$BACKUP_DIR/otavio-bot-$stamp.tar.gz"
partial="$archive.partial"

paused=""
resume() { if [ -n "$paused" ]; then docker unpause "$paused" >/dev/null || true; paused=""; fi; }
trap 'resume; rm -f "$partial"' EXIT
if [ "$BACKUP_PAUSE" = 1 ] && [ -n "$container" ] && [ "$(docker inspect -f '{{.State.Running}}' "$container")" = true ]; then
  docker pause "$container" >/dev/null
  paused="$container"
fi
# Caches the engines and npm download again by themselves.
tar --create --gzip --warning=no-file-ignored --file "$partial" --directory "$source_dir" \
  --exclude=./.cache --exclude=./.npm --exclude=./.openmausbot/tools/npm/_cacache .
resume
[ -f .env ] && cp .env "$BACKUP_DIR/env-$stamp"
mv "$partial" "$archive"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'otavio-bot-*.tar.gz' -o -name 'env-*' \) -mtime +"$BACKUP_KEEP_DAYS" -delete
echo "backup: $archive ($(du -h "$archive" | cut -f1)); keeping $BACKUP_KEEP_DAYS days in $BACKUP_DIR"
