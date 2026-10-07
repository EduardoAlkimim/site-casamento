#!/usr/bin/env bash
# Deixa a VM de 1 GB estável: tira o que consome memória sem servir ao site,
# guarda os registros entre reinícios e vigia a API. Uso: sudo bash harden.sh
set -euo pipefail

echo "== desligando serviços que não servem ao site"
# dnf-makecache: baixa metadados de pacotes periodicamente (200–400 MB de pico).
# Agente da Oracle: monitoramento/console, ~140 MB e CPU contínuos.
for unit in dnf-makecache.timer oracle-cloud-agent oracle-cloud-agent-updater tuned rpcbind.socket rpcbind; do
  systemctl disable --now "$unit" >/dev/null 2>&1 && echo "  desligado: $unit" || echo "  (não existe: $unit)"
done

echo "== memória: usar swap só em último caso"
cat > /etc/sysctl.d/90-casamento.conf <<CONF
vm.swappiness = 10
vm.vfs_cache_pressure = 50
CONF
sysctl -q --system

echo "== registros permanentes (para investigar se algo travar)"
mkdir -p /var/log/journal /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/90-casamento.conf <<CONF
[Journal]
Storage=persistent
SystemMaxUse=64M
CONF
systemctl restart systemd-journald

echo "== vigia da API (a cada minuto; reinicia se não responder)"
cat > /etc/systemd/system/casamento-health.service <<UNIT
[Unit]
Description=Confere se a API do site responde

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'curl -fsS -m 10 http://127.0.0.1:3001/api/health >/dev/null || { echo "API sem resposta, reiniciando"; systemctl restart casamento-api; }'
UNIT
cat > /etc/systemd/system/casamento-health.timer <<UNIT
[Unit]
Description=Vigia da API a cada minuto

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min

[Install]
WantedBy=timers.target
UNIT

echo "== API: reserva de memória e prioridade sobre o resto"
mkdir -p /etc/systemd/system/casamento-api.service.d
cat > /etc/systemd/system/casamento-api.service.d/90-casamento.conf <<UNIT
[Service]
MemoryLow=120M
OOMScoreAdjust=-500
UNIT

systemctl daemon-reload
systemctl enable --now casamento-health.timer >/dev/null
systemctl restart casamento-api
sleep 3
systemctl is-active casamento-api casamento-health.timer
