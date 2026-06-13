#!/usr/bin/env bash
# adline/teardown.sh — convenience wrapper
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${DIR}/scripts/teardown.sh" "$@"
