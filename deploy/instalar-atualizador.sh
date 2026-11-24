#!/usr/bin/env bash
# Installs a systemd timer that runs atualizar.sh every half hour (and soon
# after boot when the VPS was off): each version published on GitHub reaches
# this VPS by itself, with a backup first and the previous image back up if
# the new one does not come up healthy. Safe to run again.
# Run as root from the deploy folder:  sudo ./instalar-atualizador.sh
# Undo:  sudo systemctl disable --now otavio-bot-atualizar.timer
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "rode como root: sudo ./instalar-atualizador.sh" >&2; exit 1; }
here="$(pwd)"
[ -x "$here/atualizar.sh" ] && [ -x "$here/backup.sh" ] || { echo "atualizar.sh e backup.sh precisam estar em $here (e executáveis)" >&2; exit 1; }

cat > /etc/systemd/system/otavio-bot-atualizar.service <<EOF
[Unit]
Description=Atualização automática do ArkoBot
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$here
ExecStart=$here/atualizar.sh
# backup + download + up to 5 minutes waiting for the health check, with room to spare
TimeoutStartSec=1h
EOF

cat > /etc/systemd/system/otavio-bot-atualizar.timer <<'EOF'
[Unit]
Description=Atualização automática do ArkoBot (a cada 30 minutos)

[Timer]
OnCalendar=*:0/30
RandomizedDelaySec=3m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now otavio-bot-atualizar.timer
systemctl list-timers otavio-bot-atualizar.timer --no-pager
cat <<'EOF'

Pronto. A cada 30 minutos o VPS confere se saiu uma versão nova e atualiza sozinho.
  Testar agora:   sudo systemctl start otavio-bot-atualizar.service
  Ver o registro: journalctl -u otavio-bot-atualizar.service -n 30 --no-pager
  Desligar:       sudo systemctl disable --now otavio-bot-atualizar.timer
  Ficar numa versão: OTAVIO_BOT_VERSION=0.2.0 no .env (latest volta a atualizar)
EOF
