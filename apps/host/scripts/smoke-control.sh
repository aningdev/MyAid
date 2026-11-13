#!/usr/bin/env bash
# Host control smoke: serve → status → start dsh → connection → stop, over loopback HTTP.
# The API is the same on every platform; the Node script covers them all.
set -euo pipefail
exec bun "$(dirname "$0")/smoke-control.mjs"
