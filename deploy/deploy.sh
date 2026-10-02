#!/usr/bin/env bash
# Upload dist/garden-3d.html to ymg-server as an isolated static site on port 8090.
# Touches only /opt/garden and garden-web.service; ymg services are untouched.
set -euo pipefail
cd "$(dirname "$0")"

scp ../dist/garden-3d.html ymg-server:/tmp/garden-index.html
scp garden-web.service ymg-server:/tmp/garden-web.service
ssh ymg-server '
  set -e
  sudo install -d -o root -g root -m 755 /opt/garden /opt/garden/www
  sudo install -o root -g root -m 644 /tmp/garden-index.html /opt/garden/www/index.html
  sudo install -o root -g root -m 644 /tmp/garden-web.service /etc/systemd/system/garden-web.service
  rm -f /tmp/garden-index.html /tmp/garden-web.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now garden-web.service
  sudo systemctl restart garden-web.service
  sleep 1
  systemctl is-active garden-web.service
  curl -fsS -o /dev/null -w "local check: HTTP %{http_code}, %{size_download} bytes\n" http://127.0.0.1:8090/
'
echo "Open: http://123.207.235.168:8090/"
