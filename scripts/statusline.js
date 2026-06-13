#!/usr/bin/env node
// adline statusline.js — Production v0.1
// Hot path: <50ms guaranteed. Background sync every ~60s.
// Privacy: reads ONLY Claude Code's stdin JSON. Never reads files, code, or cwd.
// Outbound: only anonymous user ID, impression counts, dwell durations.

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── paths ────────────────────────────────────────────────────────────────────
const ADLINE_DIR   = path.join(os.homedir(), '.adline');
const CACHE_FILE   = path.join(ADLINE_DIR, 'current.json');
const CONFIG_FILE  = path.join(ADLINE_DIR, 'config.json');
const IMP_LOG      = path.join(ADLINE_DIR, 'impressions.log');
const SYNC_LOCK    = path.join(ADLINE_DIR, 'sync.lock');
const SYNC_TS_FILE = path.join(ADLINE_DIR, 'last_sync.txt');

const API_BASE     = process.env.ADLINE_API_BASE || 'http://localhost:3001';
const SYNC_INTERVAL_MS = 60_000;
const HARD_TIMEOUT_MS  = 45; // bail out before 50ms limit

// ── hard timeout guard ───────────────────────────────────────────────────────
const timer = setTimeout(() => {
  process.stdout.write(neutralLine(null) + '\n');
  process.exit(0);
}, HARD_TIMEOUT_MS);
timer.unref();

// ── helpers ──────────────────────────────────────────────────────────────────
function neutralLine(session) {
  if (!session) return '  Claude Code';
  const model = session.model ? session.model.split('-').slice(0,2).join('-') : 'claude';
  const cost  = session.costUSD != null ? ` · $${Number(session.costUSD).toFixed(4)}` : '';
  return `  ${model}${cost}`;
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; } catch { return false; }
}

function ensureDir() {
  try { fs.mkdirSync(ADLINE_DIR, { recursive: true }); } catch {}
}

// ── main hot path ────────────────────────────────────────────────────────────
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  clearTimeout(timer);

  let session = null;
  try {
    session = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {}

  ensureDir();

  // load config (user ID)
  const config = readJSON(CONFIG_FILE);
  const userId = config && config.userId ? config.userId : null;

  // load cached ad
  const cached = readJSON(CACHE_FILE);

  if (!cached || !cached.adText || !cached.impressionId) {
    // no ad yet — show neutral line and trigger sync
    process.stdout.write(neutralLine(session) + '\n');
    maybeSync(userId, session);
    return;
  }

  // render ad line with OSC-8 hyperlink if supported, plain URL as fallback
  const shortUrl = `${API_BASE}/c/${cached.impressionId}`;
  const icon     = cached.icon || '✦';
  const adLine   = renderAdLine(icon, cached.adText, shortUrl);

  process.stdout.write(adLine + '\n');

  // append impression tick to local log (async, non-blocking)
  appendImpressionTick(cached.adId, cached.impressionId);

  // trigger background sync if due
  maybeSync(userId, session);
});

process.stdin.resume();

// ── render ───────────────────────────────────────────────────────────────────
function renderAdLine(icon, adText, url) {
  // OSC-8 hyperlink: \e]8;;<url>\e\\<text>\e]8;;\e\\
  // Terminals that support it (iTerm2, WezTerm, Ghostty, Windows Terminal, VS Code):
  // show clean text, Cmd/Ctrl+click opens URL.
  // Unsupported terminals: fall back to plain text (OSC-8 escapes are invisible).
  const ESC = '\x1b';
  const linkOpen  = `${ESC}]8;;${url}${ESC}\\`;
  const linkClose = `${ESC}]8;;${ESC}\\`;
  const adDisplay = `${icon} ${adText} → go.adline.dev`;
  return ` ${linkOpen}${adDisplay}${linkClose}`;
}

// ── impression log ────────────────────────────────────────────────────────────
function appendImpressionTick(adId, impressionId) {
  try {
    const tick = JSON.stringify({ adId, impressionId, ts: Date.now() }) + '\n';
    fs.appendFileSync(IMP_LOG, tick);
  } catch {}
}

// ── background sync ───────────────────────────────────────────────────────────
function maybeSync(userId, session) {
  if (!userId) return;

  // check last sync time
  let lastSync = 0;
  try { lastSync = parseInt(fs.readFileSync(SYNC_TS_FILE, 'utf8'), 10) || 0; } catch {}
  if (Date.now() - lastSync < SYNC_INTERVAL_MS) return;

  // check lock file (avoid parallel syncs)
  if (fs.existsSync(SYNC_LOCK)) {
    // stale lock? (older than 30s)
    try {
      const lockStat = fs.statSync(SYNC_LOCK);
      if (Date.now() - lockStat.mtimeMs < 30_000) return;
      fs.unlinkSync(SYNC_LOCK); // remove stale lock
    } catch { return; }
  }

  // spawn detached sync process so main process exits immediately
  try {
    const { spawn } = require('child_process');
    const syncScript = path.join(__dirname, 'sync.js');

    // pass minimal context via env — no cwd, no code, no project info
    const env = {
      ADLINE_USER_ID: userId,
      ADLINE_API_BASE: API_BASE,
      ADLINE_DIR,
      // do NOT pass PWD, project paths, or any file content
    };

    const child = spawn(process.execPath, [syncScript], {
      detached: true,
      stdio:    'ignore',
      env,
    });
    child.unref();
  } catch {}
}
