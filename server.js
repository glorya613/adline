const express = require('express')
const https   = require('https')
const http    = require('http')
const path    = require('path')
const app     = express()
const PORT    = process.env.PORT || 3001

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPA_URL = process.env.SUPABASE_URL || 'https://yrisgzduscjiaepqomuc.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || ''

function supabase(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(SUPA_URL + '/rest/v1' + path)
    const lib = u.protocol === 'https:' ? https : http
    const payload = body ? JSON.stringify(body) : null
    const req = lib.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : '',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 8000
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data || 'null') }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    if (payload) req.write(payload)
    req.end()
  })
}

// ── GET /api/ad/current ───────────────────────────────────────────────────────
app.get('/api/ad/current', async (req, res) => {
  try {
    const { data: ads } = await supabase('/ads?active=eq.true&select=*')
    if (!ads || !ads.length) return res.json(fallbackAd())
    const ad = ads[Math.floor(Date.now() / 60000) % ads.length]
    res.json({ id: ad.id, text: `${ad.text}  ${ad.cta}`, url: ad.url, advertiser: ad.advertiser, icon: ad.icon, ttl: 60 })
  } catch { res.json(fallbackAd()) }
})

// ── POST /api/impression ──────────────────────────────────────────────────────
app.post('/api/impression', async (req, res) => {
  const { userId, impressions } = req.body || {}
  if (!userId || !impressions?.length) return res.json({ ok: true })
  try {
    const rows = impressions.map(i => ({
      user_id: userId,
      ad_id: i.adId,
      impression_id: i.impressionId,
      ts: i.ts
    }))
    await supabase('/impressions', 'POST', rows)
  } catch (e) { console.error('[impression]', e.message) }
  res.json({ ok: true })
})

// ── POST /api/click ───────────────────────────────────────────────────────────
app.post('/api/click', async (req, res) => {
  const { ad_id, session_id } = req.body || {}
  try {
    await supabase('/clicks', 'POST', { user_id: session_id || null, ad_id })
  } catch {}
  res.json({ ok: true })
})

// ── GET /c/:impressionId — click redirect ─────────────────────────────────────
app.get('/c/:impressionId', async (req, res) => {
  try {
    const { data: ads } = await supabase('/ads?active=eq.true&select=url')
    const url = ads?.[0]?.url || 'https://adline.dev'
    await supabase('/clicks', 'POST', { impression_id: req.params.impressionId })
    res.redirect(302, url)
  } catch { res.redirect(302, 'https://adline.dev') }
})

// ── POST /api/install ─────────────────────────────────────────────────────────
app.post('/api/install', async (req, res) => {
  const { userId, token, src } = req.body || {}
  if (!userId || !token) return res.json({ ok: true })
  try {
    await supabase('/users', 'POST', { user_id: userId, token, src: src || 'direct' })
  } catch (e) { /* duplicate = existing user, ignore */ }
  res.json({ ok: true })
})

// ── POST /api/optout ──────────────────────────────────────────────────────────
app.post('/api/optout', async (req, res) => {
  console.log(`[optout] userId=${req.body?.userId}`)
  res.json({ ok: true })
})

// ── GET /api/stats ────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [{ data: imp }, { data: clk }, { data: usr }] = await Promise.all([
      supabase('/impressions?select=count', 'GET'),
      supabase('/clicks?select=count', 'GET'),
      supabase('/users?select=count', 'GET')
    ])
    const impressions = imp?.[0]?.count || 0
    const clicks      = clk?.[0]?.count || 0
    res.json({
      impressions, clicks,
      ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0%',
      publishers: usr?.[0]?.count || 0,
      uptime_s: Math.floor(process.uptime())
    })
  } catch (e) { res.json({ error: e.message }) }
})

// ── GET /me/:token — publisher dashboard ──────────────────────────────────────
app.get('/me/:token', async (req, res) => {
  let stats = { impressions: 0, clicks: 0, est_earnings_usd: 0 }
  try {
    const { data } = await supabase(`/publisher_stats?token=eq.${req.params.token}&select=*`)
    if (data?.[0]) stats = data[0]
  } catch {}
  res.send(`<!DOCTYPE html>
<html><head><meta charset=utf-8><title>adline dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',sans-serif;background:#08080f;color:#fff;padding:48px 32px;max-width:560px}
  h1{font-size:22px;font-weight:700;margin-bottom:4px}span.dot{color:#6c63ff}
  p.sub{color:#555;font-size:13px;margin-bottom:40px}
  .card{background:#111;border:1px solid #1e1e2e;border-radius:12px;padding:20px 24px;margin-bottom:16px}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#555;margin-bottom:6px}
  .value{font-size:32px;font-weight:700;color:#fff}
  .value.green{color:#22c55e}
  .footer{margin-top:40px;font-size:12px;color:#333}
</style></head>
<body>
<h1>✦ adline<span class=dot>.</span></h1>
<p class=sub>Publisher Dashboard</p>
<div class=card><div class=label>Impressions</div><div class=value>${stats.impressions}</div></div>
<div class=card><div class=label>Clicks</div><div class=value>${stats.clicks}</div></div>
<div class=card><div class=label>Estimated Earnings</div><div class="value green">$${Number(stats.est_earnings_usd || 0).toFixed(4)}</div></div>
<p class=footer>Revenue updates every sync. Payments via Stripe monthly.<br>Token: ${req.params.token}</p>
</body></html>`)
})

// ── GET /thanks — post-checkout landing ──────────────────────────────────────
app.get('/thanks', (req, res) => {
  const plan = req.query.plan || 'advertiser'
  res.send(`<!DOCTYPE html>
<html><head><meta charset=utf-8><title>Welcome to adline</title>
<style>body{font-family:'Helvetica Neue',sans-serif;background:#07070f;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;max-width:480px;padding:48px 32px}
h1{font-size:32px;font-weight:700;margin-bottom:12px}.dot{color:#6c63ff}
p{color:#555;font-size:15px;margin-bottom:32px}
a{display:inline-block;padding:12px 28px;background:#6c63ff;color:#fff;border-radius:8px;font-weight:600;text-decoration:none}
</style></head>
<body><div class=box>
<h1>✦ Welcome to adline<span class=dot>.</span></h1>
<p>Your <strong>${plan}</strong> plan is confirmed. We'll have your ads running within 24 hours. Check your inbox for next steps.</p>
<a href="/">Back to adline.dev</a>
</div></body></html>`)
})


function fallbackAd() {
  return { id: 'ad_003', text: '📡 Earn 50% rev-share — adline  Join →', url: 'https://adline.dev', advertiser: 'adline', icon: '✦', ttl: 60 }
}

app.listen(PORT, () => {
  console.log(`adline server running on http://localhost:${PORT}`)
  console.log(`  Supabase: ${SUPA_URL}`)
})
