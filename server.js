/* global process */
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

const app = express()
const PORT = process.env.PORT || 3001
const FINNHUB_KEY = process.env.FINNHUB_KEY || ''

// Resolve persistent data root (Render recommended: /var/data)
const DATA_ROOT = (() => {
  const preferred = process.env.DATA_ROOT || '/var/data'
  try {
    if (fs.existsSync(preferred)) return preferred
  } catch { /* ignore */ }
  return process.cwd()
})()

// Allow frontend origin(s) from env (comma-separated)
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  ...FRONTEND_ORIGINS,
]
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
}))
app.use(express.json())

// Behind proxy (Render), trust X-Forwarded-* headers
app.set('trust proxy', 1)
// Basic security headers
app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))
// Rate limit API
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false })
app.use('/api', apiLimiter)

// Persistent storage paths
const uploadsDir = path.resolve(DATA_ROOT, 'uploads')
const docsDir = path.resolve(uploadsDir, 'Docs')
const reportsDir = path.resolve(uploadsDir, 'reports')
fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(docsDir, { recursive: true })
fs.mkdirSync(reportsDir, { recursive: true })
const metaPath = path.join(reportsDir, 'meta.json')
if (!fs.existsSync(metaPath)) fs.writeFileSync(metaPath, JSON.stringify({}, null, 2))
function readMeta() { try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')) } catch { return {} } }
function writeMeta(meta) { fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2)) }

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, reportsDir) },
  filename: function (req, file, cb) {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9-_ ]/g, '')
    const time = new Date().toISOString().replace(/[:.]/g, '-')
    cb(null, `${time}-${safeBase}${path.extname(file.originalname)}`)
  }
})
function fileFilter(req, file, cb) {
  const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (allowed.includes(file.mimetype)) cb(null, true)
  else cb(new Error('Only PDF/DOC/DOCX files are allowed'))
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } })

// Admin token
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-this-token'

// Health and admin verify
app.get('/api/health', (req, res) => { res.json({ status: 'ok' }) })
app.get('/api/admin/verify', (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, message: 'Invalid token' })
  res.json({ ok: true })
})

// Reference exchanges: codes, names, suffix mapping, currency
// Load exchanges from data/exchanges.json
const exchangesPath = path.resolve(process.cwd(), 'data', 'exchanges.json')
let EXCHANGES = []
try {
  const raw = fs.readFileSync(exchangesPath, 'utf8')
  EXCHANGES = JSON.parse(raw)
} catch {
  EXCHANGES = [
    { code: 'XNAS', name: 'NASDAQ', suffix: '', currency: 'USD' },
    { code: 'XNYS', name: 'NYSE', suffix: '', currency: 'USD' },
    { code: 'XASE', name: 'NYSE American', suffix: '', currency: 'USD' },
    { code: 'ARCX', name: 'NYSE Arca', suffix: '', currency: 'USD' },
    { code: 'XLON', name: 'London Stock Exchange', suffix: '.L', currency: 'GBX' },
    { code: 'XETR', name: 'XETRA (Germany)', suffix: '.DE', currency: 'EUR' },
    { code: 'XFRA', name: 'Frankfurt (Germany)', suffix: '.DE', currency: 'EUR' },
    { code: 'XPAR', name: 'Euronext Paris', suffix: '.PA', currency: 'EUR' },
  ]
}

function mapSymbolForExchange(ticker, exchangeCode) {
  const t = String(ticker || '').toUpperCase().trim()
  const ex = EXCHANGES.find(e => e.code === String(exchangeCode || '').toUpperCase().trim())
  if (!ex) return t
  if (t === 'BRK.B') return 'BRK.B' // Finnhub accepts this
  return `${t}${ex.suffix}`
}

async function fetchFxRates() {
  const TTL_MS = 15 * 60 * 1000
  const now = Date.now()
  if (fetchFxRates._cache && (now - (fetchFxRates._ts || 0) < TTL_MS)) {
    return fetchFxRates._cache
  }
  try {
    const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`)
    const j = await r.json()
    const quote = (j && j.quote) ? j.quote : j || {}
    const usdGbp = Number(quote.GBP)
    const usdEur = Number(quote.EUR)
    if (usdGbp && usdEur) {
      const val = { usdGbp, usdEur }
      fetchFxRates._cache = val
      fetchFxRates._ts = now
      return val
    }
  } catch { /* ignore */ }
  try {
    const r1 = await fetch(`https://finnhub.io/api/v1/forex/candle?symbol=OANDA:GBP_USD&resolution=1&count=1&token=${FINNHUB_KEY}`)
    const j1 = await r1.json()
    const r2 = await fetch(`https://finnhub.io/api/v1/forex/candle?symbol=OANDA:EUR_USD&resolution=1&count=1&token=${FINNHUB_KEY}`)
    const j2 = await r2.json()
    const usdPerGbp = Array.isArray(j1?.c) && Number(j1.c[0]) ? Number(j1.c[0]) : null
    const usdPerEur = Array.isArray(j2?.c) && Number(j2.c[0]) ? Number(j2.c[0]) : null
    const usdGbp = usdPerGbp ? (1 / usdPerGbp) : null
    const usdEur = usdPerEur ? (1 / usdPerEur) : null
    if (usdGbp && usdEur) {
      const val = { usdGbp, usdEur }
      fetchFxRates._cache = val
      fetchFxRates._ts = now
      return val
    }
  } catch { /* ignore */ }
  const fallback = { usdGbp: 0.78, usdEur: 0.92 }
  fetchFxRates._cache = fallback
  fetchFxRates._ts = now
  return fallback
}

function convertToGBP(price, exchangeCode, rates) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return null
  const ex = EXCHANGES.find(e => e.code === String(exchangeCode || '').toUpperCase().trim())
  const currency = ex?.currency || 'USD'
  if (currency === 'GBX') return Math.round((p / 100) * 100) / 100
  if (currency === 'USD') return Math.round((p * rates.usdGbp) * 100) / 100
  if (currency === 'EUR') return Math.round(((p * rates.usdGbp) / rates.usdEur) * 100) / 100
  return Math.round((p * rates.usdGbp) * 100) / 100
}

async function fetchPriceGBP(ticker, exchangeCode) {
  const TTL_MS = 15 * 60 * 1000
  const now = Date.now()
  const key = `${String(ticker || '').toUpperCase().trim()}||${String(exchangeCode || '').toUpperCase().trim()}`
  if (!fetchPriceGBP._cache) fetchPriceGBP._cache = new Map()
  const cached = fetchPriceGBP._cache.get(key)
  if (cached && typeof cached.price === 'number' && cached.price > 0 && (now - cached.ts < TTL_MS)) {
    return cached.price
  }

  const mapped = mapSymbolForExchange(ticker, exchangeCode)
  const rates = await fetchFxRates()
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(mapped)}&token=${FINNHUB_KEY}`
  try {
    const r = await fetch(url)
    const j = await r.json()
    const raw = typeof j?.c === 'number' ? j.c : null
    const gbp = convertToGBP(raw, exchangeCode, rates)
    if (gbp && gbp > 0) {
      fetchPriceGBP._cache.set(key, { price: gbp, ts: now })
      return gbp
    }
  } catch {
    return null
  }
  return null
}

// Endpoint to provide exchanges reference data to the frontend
app.get('/api/exchanges', (req, res) => {
  res.json({ ok: true, exchanges: EXCHANGES })
})

// /api/price now uses exchange codes instead of MIC and returns GBP
app.get('/api/price/:ticker', async (req, res) => {
  const ticker = String(req.params.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ ok: false, error: 'Ticker is required' });
  if (ticker === 'CASH') return res.json({ ok: true, ticker, price: 1 });

  const exchange = String(req.query.exchange || '').toUpperCase().trim();
  try {
    const priceGbp = await fetchPriceGBP(ticker, exchange)
    if (!priceGbp) return res.status(404).json({ ok: false, error: 'Price not available' })
    return res.json({ ok: true, ticker, price: priceGbp })
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
})

// Remove legacy mic-based symbol mapping and duplicate FINNHUB_KEY
app.post('/api/holdings/calc', async (req, res) => {
  try {
    const input = req.body || {}
    const holdings = Array.isArray(input.holdings) ? input.holdings : []
    if (!holdings.length) return res.status(400).json({ ok: false, error: 'Holdings array is required' })

    const normalized = holdings.map(h => ({
      name: String(h.name || '').trim(),
      ticker: String(h.ticker || '').toUpperCase().trim(),
      shares: Number(h.shares) || 0,
      exchange: String(h.exchange || '').toUpperCase().trim(),
      value: h.value !== undefined ? Number(h.value) : undefined,
      defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined),
    }))

    const stockKeys = [...new Set(normalized
      .filter(h => h.ticker && h.ticker !== 'CASH')
      .map(h => `${h.ticker}||${h.exchange || ''}`))]

    const priceMap = new Map()
    if (stockKeys.length > 0) {
      try {
        const promises = stockKeys.map(k => {
          const [t, ex] = k.split('||')
          return fetchPriceGBP(t, ex)
        })
        const responses = await Promise.all(promises)
        responses.forEach((p, idx) => {
          const key = stockKeys[idx]
          priceMap.set(key, (typeof p === 'number' && p > 0) ? p : null)
        })
      } catch (err) {
        console.error('Price batch error', err)
      }
    }

    const results = []
    for (const h of normalized) {
      const { name, ticker, shares, exchange } = h
      if (!name || !ticker) return res.status(400).json({ ok: false, error: 'Each holding must include name and ticker' })

      if (ticker === 'CASH') {
        const cashInput = h.value !== undefined ? Number(h.value) : Number(h.shares)
        const value = Number.isFinite(cashInput) ? Math.max(0, Math.round(cashInput)) : 0
        results.push({ name, ticker, shares: 0, value, weight: 0, pricePerShare: 1, exchange: '' })
        continue
      }

      const key = `${ticker}||${exchange || ''}`
      const defaultPrice = (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined)
      const price = priceMap.has(key) ? priceMap.get(key) : priceMap.get(`${ticker}||`) || (typeof defaultPrice === 'number' ? defaultPrice : null)
      const value = typeof price === 'number' ? Math.max(0, Math.round(price * shares)) : null
      results.push({ name, ticker, shares, value, weight: 0, pricePerShare: (typeof price === 'number' ? price : null), exchange })
    }

    const total = results.reduce((acc, h) => acc + (typeof h.value === 'number' ? h.value : 0), 0)
    const withWeights = results.map(h => ({ ...h, weight: total > 0 && typeof h.value === 'number' ? Math.round((h.value / total) * 1000) / 10 : 0 }))

    return res.json({ ok: true, holdings: withWeights, total })
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message })
  }
})

// Update holdings persistence to write 'exchange' instead of 'mic'
app.put('/api/holdings', (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ message: 'Unauthorized: invalid admin token' })

  const input = Array.isArray(req.body?.holdings) ? req.body.holdings : null
  if (!input) return res.status(400).json({ message: 'Holdings array is required' })
  const existing = readHoldings()
  const cleaned = input.map(h => ({
    name: String(h.name || '').trim(),
    ticker: String(h.ticker || '').toUpperCase().trim(),
    shares: Math.max(0, Math.round(Number(h.shares) || 0)),
    exchange: String(h.exchange || '').toUpperCase().trim(),
    defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined),
  })).map(h => {
    const prev = existing.find(ph => String(ph.ticker || '').toUpperCase().trim() === h.ticker)
    const dp = (typeof h.defaultPrice === 'number') ? h.defaultPrice : (typeof prev?.defaultPrice === 'number' ? prev.defaultPrice : undefined)
  const { defaultPrice: _DEFAULT_PRICE, ...rest } = h
  return (typeof dp === 'number') ? { ...rest, defaultPrice: dp } : rest
  })
  try {
    writeHoldings(cleaned)
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to write holdings', error: err.message })
  }
})

app.get('/api/reports', async (req, res) => {
  try {
    const files = fs.readdirSync(reportsDir)
    const meta = readMeta()
    const reports = files.filter(f => f !== 'meta.json').map((filename) => {
      const full = path.join(reportsDir, filename)
      const stats = fs.statSync(full)
      const m = meta[filename] || {}
      const originalNameMatch = filename.split('-').slice(2).join('-')
      const normalizedMembers = Array.isArray(m.members)
        ? m.members
        : (typeof m.members === 'string' ? m.members.split(',').map(s => s.trim()).filter(Boolean) : null)
      const providedTs = m.date ? Date.parse(m.date) : NaN
      const ts = Number.isFinite(providedTs) ? providedTs : stats.mtimeMs
      return {
        filename,
        originalName: m.originalName || originalNameMatch || filename,
        title: m.title || null,
        ticker: m.ticker || null,
        reportType: m.reportType || null,
        members: normalizedMembers,
        description: m.description || null,
        date: m.date || null,
        timestamp: ts,
        size: stats.size,
      }
    }).sort((a,b) => b.timestamp - a.timestamp)
    res.json({ reports })
  } catch (error) {
    res.status(500).json({ message: 'Failed to list reports', error: error.message })
  }
})

app.get('/api/reports/download/:filename', (req, res) => {
  const requested = path.basename(req.params.filename) // prevent path traversal
  const filePath = path.join(reportsDir, requested)
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })
  res.download(filePath)
})

app.post('/api/reports/upload', upload.single('report'), (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path) } catch { /* ignore unlink errors */ void 0 } }
    return res.status(401).json({ message: 'Unauthorized: invalid admin token' })
  }
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })

  const title = (req.body?.reportName || '').toString().trim().slice(0, 200)
  const ticker = (req.body?.stockTicker || '').toString().trim().toUpperCase().slice(0, 10)
  const reportTypeRaw = (req.body?.reportType || '').toString().trim().toLowerCase()
  const allowedTypes = ['trim','buy','sell']
  const reportType = allowedTypes.includes(reportTypeRaw) ? reportTypeRaw : null
  const membersRaw = (req.body?.researchMembers || '').toString().trim()
  const members = membersRaw ? membersRaw.split(',').map(s => s.trim()).filter(Boolean) : null
  const description = (req.body?.description || '').toString().trim().slice(0, 1000)
  const reportDateRaw = (req.body?.reportDate || '').toString().trim().slice(0, 50)

  if (!title || !members || !description) {
    // Remove uploaded file if metadata is incomplete
    try { if (req.file?.path) fs.unlinkSync(req.file.path) } catch { /* ignore unlink errors */ void 0 }
    return res.status(400).json({ message: 'Missing required fields: reportName, researchMembers, description' })
  }

  const meta = readMeta()
  meta[req.file.filename] = {
    title,
    ticker: ticker || null,
    reportType,
    members,
    description,
    date: reportDateRaw || null,
    originalName: req.file.originalname,
  }
  writeMeta(meta)
  res.json({ message: 'Uploaded successfully', filename: req.file.filename })
})

app.delete('/api/reports/:filename', (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ message: 'Unauthorized: invalid admin token' })

  const requested = path.basename(req.params.filename)
  const filePath = path.join(reportsDir, requested)
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })

  try {
    fs.unlinkSync(filePath)
    const meta = readMeta()
    delete meta[requested]
    writeMeta(meta)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete report', error: error.message })
  }
})

// Serve static assets from Vite build
// Publicly serve uploaded assets (e.g., challenge documents)
app.use('/uploads', express.static(uploadsDir))

const distDir = path.resolve(process.cwd(), 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback for client-side routing (Express v5-safe)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    if (req.path.startsWith('/api/')) return next()
    if (fs.existsSync(indexHtmlPath)) return res.sendFile(indexHtmlPath)
    return next()
  })
}

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`)
})

// Holdings persistence (JSON file)
const holdingsPath = path.resolve(DATA_ROOT, 'data', 'holdings.json')
fs.mkdirSync(path.dirname(holdingsPath), { recursive: true })
if (!fs.existsSync(holdingsPath)) fs.writeFileSync(holdingsPath, JSON.stringify([], null, 2))
function readHoldings() { try { return JSON.parse(fs.readFileSync(holdingsPath, 'utf8')) } catch { return [] } }
function writeHoldings(arr) { fs.writeFileSync(holdingsPath, JSON.stringify(arr, null, 2)) }

// Read current holdings (public)
app.get('/api/holdings', (req, res) => {
  try {
    const data = readHoldings()
    return res.json({ holdings: Array.isArray(data) ? data : [] })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to read holdings', error: err.message })
  }
})

// Duplicate removed: /api/holdings PUT is defined earlier with defaultPrice preservation.

// News persistence (JSON file)
const newsPath = path.resolve(DATA_ROOT, 'data', 'news.json')
fs.mkdirSync(path.dirname(newsPath), { recursive: true })
if (!fs.existsSync(newsPath)) fs.writeFileSync(newsPath, JSON.stringify([], null, 2))
function readNews() { try { return JSON.parse(fs.readFileSync(newsPath, 'utf8')) } catch { return [] } }
function writeNews(arr) { fs.writeFileSync(newsPath, JSON.stringify(arr, null, 2)) }

// Read current news (public)
app.get('/api/news', (req, res) => {
  try {
    const data = readNews()
    return res.json({ news: Array.isArray(data) ? data : [] })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to read news', error: err.message })
  }
})

// Update news (admin only)
app.put('/api/news', (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ message: 'Unauthorized: invalid admin token' })

  const input = Array.isArray(req.body?.news) ? req.body.news : null
  if (!input) return res.status(400).json({ message: 'News array is required' })
  const cleaned = input.map(n => ({
    title: String(n.title || '').trim().slice(0, 200),
    date: String(n.date || '').trim().slice(0, 100),
    body: String(n.body || '').trim().slice(0, 2000),
  })).filter(n => n.title && n.body)
  try {
    writeNews(cleaned)
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to write news', error: err.message })
  }
})

// Delete a news item by index (admin only), mirroring reports deletion behavior
app.delete('/api/news/:index', (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ message: 'Unauthorized: invalid admin token' })

  const idx = Number(req.params.index)
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ message: 'Invalid index' })

  try {
    const items = readNews()
    if (!Array.isArray(items) || idx >= items.length) return res.status(404).json({ message: 'News item not found' })

    items.splice(idx, 1)

    writeNews(items)
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete news item', error: err.message })
  }
})

app.post('/api/holdings/defaults', async (req, res) => {
  const token = req.header('x-admin-token') || ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ message: 'Unauthorized: invalid admin token' })
  try {
    const current = readHoldings()
    const keys = [...new Set(current
      .filter(h => String(h.ticker || '').toUpperCase() && String(h.ticker || '').toUpperCase() !== 'CASH')
      .map(h => `${String(h.ticker || '').toUpperCase()}||${String(h.exchange || '').toUpperCase()}`))]

    const prices = new Map()
    if (keys.length > 0) {
      const responses = await Promise.all(keys.map(k => {
        const [t, ex] = k.split('||')
        return fetchPriceGBP(t, ex)
      }))
      responses.forEach((p, idx) => {
        const key = keys[idx]
        prices.set(key, (typeof p === 'number' && p > 0) ? p : null)
      })
    }

    const updated = current.map(h => {
      const t = String(h.ticker || '').toUpperCase()
      if (t === 'CASH') return { ...h, defaultPrice: 1 }
      const key = `${t}||${String(h.exchange || '').toUpperCase()}`
      const fetched = prices.has(key) ? prices.get(key) : prices.get(`${t}||`) || null
      const dp = (typeof fetched === 'number' && fetched > 0) ? fetched : (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined)
      return (typeof dp === 'number') ? { ...h, defaultPrice: dp } : { ...h }
    })

    writeHoldings(updated)
    return res.json({ ok: true, updatedCount: updated.length })
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update default prices', error: err.message })
  }
})
