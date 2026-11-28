// All-time tally for the Single Cycles front page, shared by every visitor.
// GET  -> {c: [1, 2, 3, 4+ cycles, no break needed], n: scrambles}
// POST {c: [five counts], n} adds a batch of scrambles.
// Stored as one Redis hash in Upstash (Vercel Marketplace sets the KV_REST_API_* variables).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'single-cycles:tally'
const FIELDS = ['c0', 'c1', 'c2', 'c3', 'c4', 'n']
const MAX_BATCH = 50

const redis = async (path, body) => {
  const r = await fetch(`${URL_}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  return r.json()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'no store' })
  try {
    if (req.method === 'POST') {
      const { c, n } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
      const ok = Number.isInteger(n) && n >= 1 && n <= MAX_BATCH && Array.isArray(c) && c.length === 5 && c.every((x) => Number.isInteger(x) && x >= 0 && x <= n)
      if (!ok) return res.status(400).json({ error: 'bad batch' })
      const adds = [...c, n]
      await redis('/pipeline', FIELDS.map((f, i) => ['HINCRBY', KEY, f, adds[i]]).filter((_, i) => adds[i]))
      return res.status(204).end()
    }
    if (req.method !== 'GET') return res.status(405).end()
    const { result } = await redis('', ['HGETALL', KEY])
    const h = {}
    for (let i = 0; i < (result || []).length; i += 2) h[result[i]] = Number(result[i + 1])
    return res.status(200).json({ c: [0, 1, 2, 3, 4].map((i) => h[`c${i}`] || 0), n: h.n || 0 })
  } catch {
    return res.status(502).json({ error: 'store failed' })
  }
}
