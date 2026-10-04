#!/usr/bin/env bash
# Prepara a VM Oracle (Oracle Linux 9, x86, ~500 MB RAM) para a API.
# Idempotente: pode rodar de novo sem estragar nada. Uso: sudo bash setup.sh
set -euo pipefail

NODE_MAJOR=24
APP_DIR=/opt/casamento
DATA_DIR=/var/lib/casamento
ENV_FILE=/etc/casamento/api.env
SITE_HOST=144-22-185-103.sslip.io

log() { printf '\n== %s\n' "$*"; }

log "Swap extra de 1 GB (a VM tem pouca memória)"
if [ ! -f /swapfile2 ]; then
  fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 >/dev/null && swapon /swapfile2
  grep -q '/swapfile2' /etc/fstab || echo '/swapfile2 none swap sw 0 0' >> /etc/fstab
fi
swapon --show

log "Node.js $NODE_MAJOR (binário oficial, com checagem SHA-256)"
if ! /usr/local/bin/node -v 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
  file=$(curl -fsSL "$base/SHASUMS256.txt" | awk '/linux-x64.tar.xz$/ {print $2}')
  sum=$(curl -fsSL "$base/SHASUMS256.txt" | awk '/linux-x64.tar.xz$/ {print $1}')
  curl -fsSL -o "/tmp/$file" "$base/$file"
  echo "$sum  /tmp/$file" | sha256sum -c -
  rm -rf /opt/node && mkdir -p /opt/node && tar -xJf "/tmp/$file" -C /opt/node --strip-components=1 && rm "/tmp/$file"
  ln -sf /opt/node/bin/node /usr/local/bin/node
  ln -sf /opt/node/bin/npm /usr/local/bin/npm
fi
/usr/local/bin/node -v

log "Caddy (HTTPS automático), binário oficial com checagem SHA-512"
if ! command -v /usr/local/bin/caddy >/dev/null; then
  tag=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
  rel="https://github.com/caddyserver/caddy/releases/download/v$tag"
  tgz="caddy_${tag}_linux_amd64.tar.gz"
  curl -fsSL -o "/tmp/$tgz" "$rel/$tgz"
  curl -fsSL "$rel/caddy_${tag}_checksums.txt" | grep " $tgz\$" | sed "s| $tgz| /tmp/$tgz|" | sha512sum -c -
  tar -xzf "/tmp/$tgz" -C /usr/local/bin caddy && rm "/tmp/$tgz"
  chmod 755 /usr/local/bin/caddy
fi
/usr/local/bin/caddy version

log "Usuários de sistema e pastas"
id casamento >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /sbin/nologin casamento
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
install -d -o casamento -g casamento -m 750 "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/backups"
install -d -m 755 "$APP_DIR" /etc/caddy
install -d -m 750 /etc/casamento

log "Segredos da API ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  secret=$(/usr/local/bin/node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=3001
HOST=127.0.0.1
DB_PATH=$DATA_DIR/casamento.db
UPLOADS_DIR=$DATA_DIR/uploads
COOKIE_SECRET=$secret
ADMIN_PASSWORD_HASH=
PUBLIC_SITE_URL=https://www.eduardothamires.com.br
ENV
  chmod 640 "$ENV_FILE" && chown root:casamento "$ENV_FILE"
  echo "criado — falta definir ADMIN_PASSWORD_HASH"
fi

log "Serviços systemd"
install -m 644 casamento-api.service caddy.service casamento-backup.service casamento-backup.timer /etc/systemd/system/
sed "s/__SITE_HOST__/$SITE_HOST/" Caddyfile > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now caddy casamento-backup.timer

log "Firewall: liberar HTTP e HTTPS"
firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
firewall-cmd --reload >/dev/null
firewall-cmd --list-services
