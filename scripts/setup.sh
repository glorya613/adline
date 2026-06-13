#!/usr/bin/env bash
# adline setup.sh — works with both npm global install and direct clone
set -euo pipefail

SETTINGS="${HOME}/.claude/settings.json"
ADLINE_DIR="${HOME}/.adline"
ADLINE_CONFIG="${ADLINE_DIR}/config.json"
BACKUP="${ADLINE_DIR}/settings.backup.json"
API_BASE="https://api.adline.dev"
SRC="${ADLINE_SRC:-direct}"

# Resolve statusline.js path — works for npm -g install AND git clone
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUSLINE_SCRIPT="${SELF_DIR}/statusline.js"

# --- create adline dir ---
mkdir -p "${ADLINE_DIR}"

# --- backup existing settings ---
if [ -f "${SETTINGS}" ]; then
  cp "${SETTINGS}" "${BACKUP}"
  echo "✓ Settings backed up to ${BACKUP}"
else
  mkdir -p "$(dirname "${SETTINGS}")"
  echo "{}" > "${SETTINGS}"
  cp "${SETTINGS}" "${BACKUP}"
  echo "✓ Created fresh settings.json"
fi

# --- generate or load user ID + token ---
USER_ID=""
TOKEN=""
if [ -f "${ADLINE_CONFIG}" ]; then
  USER_ID=$(node -e "try{const c=require('${ADLINE_CONFIG}');console.log(c.userId||'')}catch(e){console.log('')}")
  TOKEN=$(node -e "try{const c=require('${ADLINE_CONFIG}');console.log(c.token||'')}catch(e){console.log('')}")
fi

if [ -z "${USER_ID}" ]; then
  USER_ID=$(node -e "const {randomUUID}=require('crypto');console.log(randomUUID())")
  TOKEN=$(node -e "const {randomUUID}=require('crypto');console.log(randomUUID())")
  echo "{\"userId\":\"${USER_ID}\",\"token\":\"${TOKEN}\",\"src\":\"${SRC}\"}" > "${ADLINE_CONFIG}"
  echo "✓ User ID generated: ${USER_ID}"
fi

# --- patch statusLine in settings.json ---
node - <<EOF
const fs = require('fs');
const path = '${SETTINGS}';
let settings = {};
try { settings = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
settings.statusLine = 'node ${STATUSLINE_SCRIPT}';
fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
console.log('✓ statusLine patched in ' + path);
EOF

# --- send install ping + register user (best-effort) ---
node - <<EOF || true
const https = require('https');
const data = JSON.stringify({ userId: '${USER_ID}', token: '${TOKEN}', src: '${SRC}', installDate: new Date().toISOString() });
const url = new URL('${API_BASE}/api/install');
const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  timeout: 5000
}, () => {});
req.on('error', () => {});
req.on('timeout', () => req.destroy());
req.write(data);
req.end();
EOF

echo ""
echo "✦ adline is live. Restart Claude Code for the statusline to appear."
echo ""
echo "  Your dashboard: ${API_BASE}/me/${TOKEN}"
echo ""
echo "  Earn 50% rev-share on every impression."
echo "  To stop: adline remove"
