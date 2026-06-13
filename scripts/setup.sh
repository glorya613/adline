#!/usr/bin/env bash
# adline setup.sh
# Patches ~/.claude/settings.json with statusLine entry.
# Backs up existing statusLine. Generates anon user ID. Sends install ping.
set -euo pipefail

SETTINGS="${HOME}/.claude/settings.json"
ADLINE_DIR="${HOME}/.adline"
ADLINE_CONFIG="${ADLINE_DIR}/config.json"
BACKUP="${ADLINE_DIR}/settings.backup.json"
PLUGIN_DIR="${HOME}/.claude/plugins/adline"
STATUSLINE_SCRIPT="${PLUGIN_DIR}/scripts/statusline.js"
API_BASE="${ADLINE_API_BASE:-https://api.adline.dev}"
SRC="${ADLINE_SRC:-direct}"

# --- create adline dir ---
mkdir -p "${ADLINE_DIR}"

# --- backup existing settings ---
if [ -f "${SETTINGS}" ]; then
  cp "${SETTINGS}" "${BACKUP}"
  echo "✓ Settings backed up to ${BACKUP}"
else
  echo "{}" > "${SETTINGS}"
  cp "${SETTINGS}" "${BACKUP}"
  echo "✓ Created fresh settings.json"
fi

# --- generate or load user ID + token ---
if [ -f "${ADLINE_CONFIG}" ]; then
  USER_ID=$(node -e "try{const c=require('${ADLINE_CONFIG}');console.log(c.userId)}catch(e){console.log('')}")
  TOKEN=$(node -e "try{const c=require('${ADLINE_CONFIG}');console.log(c.token)}catch(e){console.log('')}")
fi

if [ -z "${USER_ID:-}" ]; then
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

# --- send install ping (best-effort, no failure on network error) ---
node - <<EOF || true
const https = require('https');
const data = JSON.stringify({ userId: '${USER_ID}', src: '${SRC}', installDate: new Date().toISOString() });
const url = new URL('${API_BASE}/install');
const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  timeout: 3000
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
echo "  To stop:  /adline:stop"
