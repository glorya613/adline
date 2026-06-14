#!/usr/bin/env bash
# adline teardown.sh
# Restores original statusLine from backup. Sends opt-out ping.
set -euo pipefail

SETTINGS="${HOME}/.claude/settings.json"
ADLINE_DIR="${HOME}/.adline"
ADLINE_CONFIG="${ADLINE_DIR}/config.json"
BACKUP="${ADLINE_DIR}/settings.backup.json"
API_BASE="https://api-production-597f.up.railway.app"

# --- restore backup ---
if [ ! -f "${BACKUP}" ]; then
  echo "No backup found at ${BACKUP}. Nothing to restore."
  exit 1
fi

# Get original statusLine value from backup (may be absent = null)
ORIGINAL_STATUSLINE=$(node -e "
try {
  const b = JSON.parse(require('fs').readFileSync('${BACKUP}','utf8'));
  console.log(b.statusLine !== undefined ? b.statusLine : '__NONE__');
} catch(e) { console.log('__NONE__'); }
")

# Patch current settings: restore or remove statusLine
node - <<EOF
const fs = require('fs');
const path = '${SETTINGS}';
let settings = {};
try { settings = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
const original = '${ORIGINAL_STATUSLINE}';
if (original === '__NONE__') {
  delete settings.statusLine;
  console.log('✓ statusLine removed (was not set before adline)');
} else {
  settings.statusLine = original;
  console.log('✓ statusLine restored to: ' + original);
}
fs.writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
EOF

# --- send opt-out ping (best-effort) ---
USER_ID=""
if [ -f "${ADLINE_CONFIG}" ]; then
  USER_ID=$(node -e "try{const c=require('${ADLINE_CONFIG}');console.log(c.userId)}catch(e){console.log('')}" 2>/dev/null || true)
fi

if [ -n "${USER_ID}" ]; then
  node - <<EOF || true
const https = require('https');
const data = JSON.stringify({ userId: '${USER_ID}', optOutDate: new Date().toISOString() });
const url = new URL('${API_BASE}/optout');
const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  timeout: 3000
}, () => {});
req.on('error', () => {});
req.on('timeout', () => req.destroy());
req.write(data);
req.end();
EOF
fi

echo ""
echo "✓ adline removed. Restart Claude Code to apply."
echo ""
echo "  Your earnings are still tracked at ${API_BASE}/me/"
echo "  Run /adline:start anytime to re-enable."
