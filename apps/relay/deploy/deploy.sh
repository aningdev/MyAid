#!/usr/bin/env bash
# One command from a checkout to a running Relay on a VPS:
#   apps/relay/deploy/deploy.sh <ssh-target> <domain> [--skip-dns-check]
# Builds a static Linux binary for the server's CPU, uploads it with install.sh, and runs
# install.sh there as root (through sudo when the SSH user is not root).
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }
[ $# -ge 2 ] || die "usage: $0 <ssh-target> <domain> [--skip-dns-check]"
TARGET="$1"
DOMAIN="$2"
shift 2
for arg in "$@"; do
  [ "$arg" = --skip-dns-check ] || die "unknown argument: $arg"
done

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
for tool in cargo rustup ssh scp; do
  command -v "$tool" >/dev/null || die "$tool is required on this machine"
done

echo "==> asking $TARGET for its CPU"
case "$(ssh "$TARGET" uname -m)" in
  x86_64 | amd64) ARCH=x86_64 ;;
  aarch64 | arm64) ARCH=aarch64 ;;
  *) die "unsupported CPU on $TARGET" ;;
esac
TRIPLE="$ARCH-unknown-linux-musl"

echo "==> building dsh-bot-relay for $TRIPLE"
rustup target add "$TRIPLE" >/dev/null
LINKER_VAR="CARGO_TARGET_$(echo "$TRIPLE" | tr 'a-z-' 'A-Z_')_LINKER"
env "$LINKER_VAR=rust-lld" CARGO_PROFILE_RELEASE_STRIP=symbols \
  cargo build --release --locked -p dsh-bot-relay --target "$TRIPLE" --manifest-path "$ROOT/Cargo.toml"
BINARY="$ROOT/target/$TRIPLE/release/dsh-bot-relay"

echo "==> uploading to $TARGET"
REMOTE_DIR="$(ssh "$TARGET" mktemp -d)"
scp -q "$BINARY" "$HERE/install.sh" "$TARGET:$REMOTE_DIR/"

SUDO=""
ssh "$TARGET" 'test "$(id -u)" = 0' || SUDO="sudo"
REMOTE_CMD="$SUDO bash $REMOTE_DIR/install.sh --domain $(printf %q "$DOMAIN") --binary $REMOTE_DIR/dsh-bot-relay $*; rc=\$?; rm -rf $REMOTE_DIR; exit \$rc"
# A terminal only when sudo may ask for a password.
ssh ${SUDO:+-t} "$TARGET" "$REMOTE_CMD"
