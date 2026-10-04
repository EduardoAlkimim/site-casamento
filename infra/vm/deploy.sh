#!/usr/bin/env bash
# Publica a API na VM a partir do commit atual. Uso (da raiz do projeto):
#   bash infra/vm/deploy.sh [ref]   (padrão: HEAD)
set -euo pipefail
REF=${1:-HEAD}
KEY=${SSH_KEY:-ssh-key-2026-10-04.key}
HOST=${VM_HOST:-opc@144.22.185.103}

git archive --format=tar "$REF" package.json package-lock.json apps/api apps/web/package.json \
  | ssh -i "$KEY" "$HOST" 'sudo bash -c "
      set -e
      export PATH=/usr/local/bin:$PATH
      rm -rf /opt/casamento.new && mkdir -p /opt/casamento.new && tar -xm -C /opt/casamento.new
      cd /opt/casamento.new && /usr/local/bin/npm ci --omit=dev --workspace=api --no-audit --no-fund --loglevel=error
      rm -rf /opt/casamento.old && { [ -d /opt/casamento ] && mv /opt/casamento /opt/casamento.old || true; }
      mv /opt/casamento.new /opt/casamento
      systemctl enable casamento-api >/dev/null 2>&1
      systemctl restart casamento-api && sleep 3 && systemctl is-active casamento-api
      curl -fsS http://127.0.0.1:3001/api/health
    "'
