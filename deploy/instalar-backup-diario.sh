#!/usr/bin/env bash
# Installs a systemd timer that runs backup.sh every day at about 04:15
# (and at the next boot when the VPS was off at that hour).
# Run as root from the deploy folder:  sudo ./instalar-backup-diario.sh
# Undo:  sudo systemctl disable --now otavio-bot-backup.timer
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "rode como root: sudo ./instalar-backup-diario.sh" >&2; exit 1; }
here="$(pwd)"

cat > /etc/systemd/system/otavio-bot-backup.service <<EOF
[Unit]
Description=Backup diário do Otávio Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=$here
ExecStart=$here/backup.sh
EOF

cat > /etc/systemd/system/otavio-bot-backup.timer <<'EOF'
[Unit]
Description=Backup diário do Otávio Bot

[Timer]
OnCalendar=*-*-* 04:15:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now otavio-bot-backup.timer
systemctl list-timers otavio-bot-backup.timer --no-pager
echo "Para testar agora: sudo systemctl start otavio-bot-backup.service && journalctl -u otavio-bot-backup.service -n 5 --no-pager"
