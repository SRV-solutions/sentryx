#!/usr/bin/env bash
# Instalación de Sentryx en un VPS Ubuntu 24.04 limpio (sin Docker).
# Deja: Node 22 + PostgreSQL + Caddy (HTTPS automático) + API y tiempo real como servicios systemd + backup diario.
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/<usuario>/sentryx/main/deploy/setup-server.sh -o setup.sh
#   bash setup.sh <repo_git> <api.dominio.com> <rt.dominio.com>
set -euo pipefail

REPO="${1:?Uso: setup.sh <repo_git> <api_domain> <realtime_domain>}"
API_DOMAIN="${2:?Falta el dominio de la API}"
RT_DOMAIN="${3:?Falta el dominio de tiempo real}"
APP_DIR=/opt/sentryx
DB_PASS="$(openssl rand -hex 16)"

echo "==> Paquetes del sistema"
apt-get update -y
apt-get install -y curl git ufw postgresql postgresql-contrib debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades

echo "==> Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Caddy (HTTPS automático)"
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

echo "==> Usuario y base de datos"
id -u sentryx >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin sentryx
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='sentryx'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER sentryx WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='sentryx'" | grep -q 1 || sudo -u postgres createdb -O sentryx sentryx

echo "==> Código"
if [ ! -d "$APP_DIR" ]; then git clone "$REPO" "$APP_DIR"; fi
chown -R sentryx:sentryx "$APP_DIR"
cd "$APP_DIR/api"
sudo -u sentryx npm ci
sudo -u sentryx npm run build

if [ ! -f "$APP_DIR/api/.env" ]; then
  cp "$APP_DIR/deploy/.env.example" "$APP_DIR/api/.env"
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|" "$APP_DIR/api/.env"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" "$APP_DIR/api/.env"
  sed -i "s|^REALTIME_SECRET=.*|REALTIME_SECRET=$(openssl rand -hex 32)|" "$APP_DIR/api/.env"
  chown sentryx:sentryx "$APP_DIR/api/.env" && chmod 600 "$APP_DIR/api/.env"
  echo "   ⚠️  Completá el resto de $APP_DIR/api/.env (R2, email, push, dominios) antes de usar en producción."
fi

echo "==> Servicios systemd"
cp "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sentryx-realtime sentryx-api sentryx-backup.timer

echo "==> Caddy"
sed -e "s|{API_DOMAIN}|${API_DOMAIN}|" -e "s|{RT_DOMAIN}|${RT_DOMAIN}|" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Firewall y actualizaciones de seguridad automáticas"
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "✅ Listo. Verificá:"
echo "   curl https://${API_DOMAIN}/health      (API)"
echo "   curl https://${RT_DOMAIN}/health       (tiempo real)"
echo "   journalctl -u sentryx-api -f           (logs)"
echo "Crear la primera escuela:  cd $APP_DIR/api && sudo -u sentryx npm run bootstrap -- --school \"...\" --slug ... --admin-email ... --admin-first ... --admin-last ..."
