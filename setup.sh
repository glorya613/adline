#!/usr/bin/env bash
# adline/setup.sh — convenience wrapper
# Calls the actual setup script in scripts/
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${DIR}/scripts/setup.sh" "$@"
