const express = require('express')
const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

// --- In-memory store (replace with Supabase later) ---
let impressions = 0
let clicks = 0

const ADS = [
  {
    id: 'ad_001',
    advertiser: 'Vercel',
    text: '⚡ Deploy in seconds — Vercel',
    url: 'https://vercel.com',
    cta: 'Try free →',
  },
  {
    id: 'ad_002',
    advertiser: 'Supabase',
    text: '🐘 Open source Firebase — Supabase',
    url: 'https://supabase.com',
    cta: 'Start building →',
  },
  {
    id: 'ad_003',
    advertiser: 'adline',
    text: '📡 You are seeing adline — earn 50% rev-share',
    url: 'https://adline.dev',
    cta: 'Join →',
  },
]

// Rotate ad every 60s based on timestamp
function getCurrentAd() {
  const slot = Math.floor(Date.now() / 60000) % ADS.length
  return ADS[slot]
}

// GET /api/ad/current
app.get('/api/ad/current', (req, res) => {
  const ad = getCurrentAd()
  res.json({
    id: ad.id,
    text: `${ad.text}  ${ad.cta}`,
    url: ad.url,
    advertiser: ad.advertiser,
    ttl: 60,
  })
})

// POST /api/impression
app.post('/api/impression', (req, res) => {
  const { ad_id, session_id } = req.body || {}
  impressions++
  console.log(`[impression] ad=${ad_id} session=${session_id || 'anon'} total=${impressions}`)
  res.json({ ok: true })
})

// POST /api/click
app.post('/api/click', (req, res) => {
  const { ad_id, session_id } = req.body || {}
  clicks++
  console.log(`[click]      ad=${ad_id} session=${session_id || 'anon'} total=${clicks}`)
  res.json({ ok: true })
})

// GET /api/stats (internal dashboard check)
app.get('/api/stats', (req, res) => {
  res.json({
    impressions,
    clicks,
    ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0%',
    current_ad: getCurrentAd().id,
    uptime_s: Math.floor(process.uptime()),
  })
})

// GET /c/:impressionId — click redirect
app.get('/c/:impressionId', (req, res) => {
  const { impressionId } = req.params
  clicks++
  console.log(`[click-redirect] imp=${impressionId} total=${clicks}`)
  // find the ad for this impression (simple: redirect to current ad URL)
  const ad = getCurrentAd()
  res.redirect(302, ad.url)
})

// POST /api/install
app.post('/api/install', (req, res) => {
  const { userId, src, installDate } = req.body || {}
  console.log(`[install] userId=${userId} src=${src} date=${installDate}`)
  res.json({ ok: true })
})

// POST /api/optout
app.post('/api/optout', (req, res) => {
  const { userId, optOutDate } = req.body || {}
  console.log(`[optout] userId=${userId} date=${optOutDate}`)
  res.json({ ok: true })
})

// GET /me/:token — publisher dashboard (minimal)
app.get('/me/:token', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset=utf-8><title>adline dashboard</title>
<style>body{font-family:monospace;background:#0a0a0f;color:#fff;padding:40px;max-width:600px}
h1{color:#6c63ff}table{width:100%;border-collapse:collapse;margin-top:24px}
td,th{padding:10px;border:1px solid #222;text-align:left}th{color:#8b83ff}</style></head>
<body>
<h1>✦ adline</h1>
<p>Token: <code>${req.params.token}</code></p>
<table>
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Impressions</td><td>${impressions}</td></tr>
<tr><td>Clicks</td><td>${clicks}</td></tr>
<tr><td>CTR</td><td>${impressions > 0 ? ((clicks/impressions)*100).toFixed(2) : 0}%</td></tr>
<tr><td>Est. Earnings</td><td>$${(impressions * 0.0003).toFixed(4)}</td></tr>
</table>
<p style="margin-top:24px;color:#555">Revenue updates daily. Payments via Stripe monthly.</p>
</body></html>`)
})

app.listen(PORT, () => {
  console.log(`adline server running on http://localhost:${PORT}`)
  console.log(`  GET  /api/ad/current`)
  console.log(`  POST /api/impression`)
  console.log(`  POST /api/click`)
  console.log(`  GET  /api/stats`)
})
