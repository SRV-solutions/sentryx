#!/usr/bin/env bash
# Actualiza Sentryx en el servidor: trae el código, compila y reinicia SOLO la API.
# El servidor de tiempo real no se reinicia: los chats abiertos no se cortan.
# Para actualizar también el tiempo real:  bash update.sh --realtime
set -euo pipefail
cd /opt/sentryx
sudo -u sentryx git pull --ff-only
cd api
sudo -u sentryx npm ci
sudo -u sentryx npm run build
systemctl restart sentryx-api          # corre las migraciones al arrancar (ExecStartPre)
if [ "${1:-}" = "--realtime" ]; then systemctl restart sentryx-realtime; fi
sleep 3
systemctl --no-pager --lines=5 status sentryx-api
