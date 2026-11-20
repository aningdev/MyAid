#!/usr/bin/env bash
# Installs or upgrades dsh-bot-relay behind Caddy on a Debian or Ubuntu server.
# Run as root on the server; deploy.sh uploads this file with the binary and runs it.
#   install.sh --domain relay.example.com --binary ./dsh-bot-relay [--skip-dns-check]
# Re-running it upgrades the binary in place; every open tunnel drops and reconnects.
set -euo pipefail

DOMAIN=""
BINARY=""
SKIP_DNS_CHECK=0
PORT=8787
UNIT=dsh-bot-relay
BIN_PATH=/usr/local/bin/dsh-bot-relay
SITE=/etc/caddy/dsh-bot-relay.caddy

die() { echo "error: $*" >&2; exit 1; }
step() { echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --binary) BINARY="${2:-}"; shift 2 ;;
    --skip-dns-check) SKIP_DNS_CHECK=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$DOMAIN" ] || die "--domain is required"
[ -f "$BINARY" ] || die "--binary must name the dsh-bot-relay executable"
[ "$(id -u)" = 0 ] || die "run as root"
command -v apt-get >/dev/null || die "only Debian and Ubuntu are supported (no apt-get)"
command -v systemctl >/dev/null || die "systemd is required"

step "checking DNS for $DOMAIN"
if [ "$SKIP_DNS_CHECK" = 0 ]; then
  resolved=$(getent ahosts "$DOMAIN" | awk '{print $1}' | sort -u || true)
  local_addrs=$(ip -o addr show scope global | awk '{split($4, a, "/"); print a[1]}' | sort -u)
  [ -n "$resolved" ] || die "$DOMAIN does not resolve; add an A record pointing at this server (DNS only, not proxied)"
  if [ -z "$(comm -12 <(echo "$resolved") <(echo "$local_addrs"))" ]; then
    die "$DOMAIN resolves to $(echo $resolved) but this server has $(echo $local_addrs); fix the record (a CDN proxy must be off), or pass --skip-dns-check behind NAT"
  fi
fi

step "checking ports 80 and 443"
busy=$(ss -ltnpH '( sport = :80 or sport = :443 )' | grep -v '"caddy"' || true)
[ -z "$busy" ] || die "ports 80/443 are held by another program:
$busy"

fresh_caddy=0
if ! command -v caddy >/dev/null; then
  step "installing Caddy from its official repository"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl gpg ca-certificates >/dev/null
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
  fresh_caddy=1
fi

step "installing $BIN_PATH"
install -m 0755 "$BINARY" "$BIN_PATH"

step "writing the $UNIT service"
cat > /etc/systemd/system/$UNIT.service <<EOF
[Unit]
Description=dsh-bot Relay
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$BIN_PATH serve --bind 127.0.0.1 --port $PORT --trusted-proxy 127.0.0.1
Environment=RUST_LOG=info
Restart=always
RestartSec=2
DynamicUser=yes
LimitNOFILE=65536
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q $UNIT
systemctl restart $UNIT

step "pointing Caddy at the Relay"
cat > "$SITE" <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:$PORT
}
EOF
import_line="import $SITE"
if [ "$fresh_caddy" = 1 ]; then
  # A fresh package ships a placeholder site on :80; this server only serves the Relay.
  echo "$import_line" > /etc/caddy/Caddyfile
elif ! grep -qxF "$import_line" /etc/caddy/Caddyfile; then
  printf '\n%s\n' "$import_line" >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || die "the Caddyfile does not validate: caddy validate --config /etc/caddy/Caddyfile"
systemctl enable -q caddy
systemctl reload-or-restart caddy

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  step "opening 80 and 443 in ufw"
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

step "waiting for https://$DOMAIN/v1/health (the first run waits for the certificate)"
for _ in $(seq 1 60); do
  if health=$(curl -sf --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/v1/health"); then
    echo "$health"
    step "done: the Relay is https://$DOMAIN"
    exit 0
  fi
  sleep 3
done
die "no healthy answer after 3 minutes; see journalctl -u caddy -u $UNIT -n 50"
