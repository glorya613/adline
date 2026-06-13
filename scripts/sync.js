#!/usr/bin/env node
// adline sync.js — Background sync worker (spawned detached)
// Fetches current ad from API, updates local cache.
// Uploads impression log.
// Privacy: sends only anonymous user ID + impression counts.

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const API_BASE    = process.env.ADLINE_API_BASE || 'https://api.adline.dev';
const ADLINE_DIR  = process.env.ADLINE_DIR || path.join(require('os').homedir(), '.adline');
const USER_ID     = process.env.ADLINE_USER_ID;
const CACHE_FILE  = path.join(ADLINE_DIR, 'current.json');
const IMP_LOG     = path.join(ADLINE_DIR, 'impressions.log');
const SYNC_LOCK   = path.join(ADLINE_DIR, 'sync.lock');
const SYNC_TS     = path.join(ADLINE_DIR, 'last_sync.txt');

if (!USER_ID) process.exit(0);

// write lock
try { fs.writeFileSync(SYNC_LOCK, String(Date.now())); } catch { process.exit(0); }

async function main() {
  try {
    // 1. upload impression log
    await uploadImpressions();

    // 2. fetch fresh ad
    const ad = await fetchAd();
    if (ad) {
      // normalize: server returns {id, text, url, advertiser} → cache uses {adId, adText, impressionId, icon}
      const cache = {
        adId: ad.id,
        adText: ad.text,
        impressionId: ad.id + '_' + Date.now(),
        icon: '✦',
        url: ad.url,
        advertiser: ad.advertiser,
        ttl: ad.ttl || 60,
        fetchedAt: Date.now(),
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }

    // 3. update sync timestamp
    fs.writeFileSync(SYNC_TS, String(Date.now()));
  } catch {}

  // remove lock
  try { fs.unlinkSync(SYNC_LOCK); } catch {}
  process.exit(0);
}

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
      timeout:  5000,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

async function fetchAd() {
  try {
    const res = await request(`${API_BASE}/api/ad/current?userId=${encodeURIComponent(USER_ID)}`);
    if (res.status === 200) return JSON.parse(res.body);
  } catch {}
  return null;
}

async function uploadImpressions() {
  let raw = '';
  try { raw = fs.readFileSync(IMP_LOG, 'utf8'); } catch { return; }
  if (!raw.trim()) return;

  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return;

  const impressions = [];
  for (const line of lines) {
    try { impressions.push(JSON.parse(line)); } catch {}
  }
  if (impressions.length === 0) return;

  const body = JSON.stringify({ userId: USER_ID, impressions });
  try {
    await request(
      `${API_BASE}/api/impression`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      body
    );
    // clear log on success
    fs.writeFileSync(IMP_LOG, '');
  } catch {}
}

main();
