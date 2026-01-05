import { useEffect, useState, useRef, useCallback } from 'react'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import './index.css'

// Base URL for backend API, configurable via Vite env
const API_BASE = import.meta.env.VITE_API_BASE || ''
const VALID_PAGES = new Set(['about','news','portfolio','reports','challenge','signup'])

function App() {
  const [page, setPage] = useState(() => {
    const h = (window.location.hash || '').replace('#','').trim().toLowerCase()
    return VALID_PAGES.has(h) ? h : 'about'
  })
  const [reportsList, setReportsList] = useState([])
  const [adminToken, setAdminToken] = useState(localStorage.getItem('ADMIN_TOKEN') || import.meta.env.VITE_ADMIN_TOKEN || '')
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAuthed, setAdminAuthed] = useState(localStorage.getItem('ADMIN_AUTH') === 'true')
  const [showPassword, setShowPassword] = useState(false)
  const [adminTab, setAdminTab] = useState('news')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [portfolioAuthed, setPortfolioAuthed] = useState(localStorage.getItem('PORTFOLIO_AUTH') === 'true')
  const [portfolioPassword, setPortfolioPassword] = useState('')
  const [docTab, setDocTab] = useState('template')
  const challengeDocs = [
    { key: 'prize', label: '1. Guide', file: 'Guide.pdf', blurb: <>This guide outlines awards criteria and prize distribution for the challenge.</> },
    { key: 'template', label: '2. Strategy Template', file: 'Strategy Template.pdf', blurb: <>Once you are clear on the objective of this initial investment strategy, please fill out the template below and submit <a href="https://bit.ly/ECHCIC" target="_blank" rel="noopener noreferrer">this form</a> before the 10th January 2025.</> },
    { key: 'exemplar', label: '3. Exemplar Strategy', file: 'Exemplar Strategy.pdf', blurb: <>Here is an exemplar strategy which three students from Holyport College created: </> }
  ]
  const team = {
    ceo: [
      { name: 'Julian Gimenez', role: 'CEO (Chairman)', email: 'Gimenez.J@etoncollege.org.uk' },
    ],
    coo: [
      { name: 'William Parsons', role: 'COO', email: 'Parsons.W@etoncollege.org.uk' },
    ],
    cfo: [
      { name: 'Alex Wong', role: 'CFO', email: 'Wong.A@etoncollege.org.uk' },
    ],
    outreach: [
      { name: 'Andrew Zhang', role: 'Director of Outreach', email: 'Zhang.A@etoncollege.org.uk' },
    ],
    board: [
      { name: 'Logan Moore (Holyport)', sector: 'Financials' },
      { name: 'Monique Vasileva (Holyport)', sector: 'Consumer Goods' },
      { name: 'Giacomo Rubino', sector: 'Financials' },
      { name: 'Ari Mahbubani', sector: 'Consumer Goods' },
      { name: 'Dhyan Patel', sector: 'Tech' },
      { name: 'Louis Zegrean', sector: 'Pharma' },
      { name: 'Geoffroy Molhant-Proost', sector: 'Commodities' },
      { name: 'Zachary Heslop', sector: 'Defence' },
      { name: 'Jonny Leslie', sector: 'Energy' },
    ],
    advisors: [
      { name: 'Stuart Leigh-Davies' },
      { name: 'Winston Ginsberg' },
    ],
  }
  const getLastName = (name) => {
    const base = String(name || '').replace(/\([^)]*\)/g, '').trim()
    const parts = base.split(/\s+/)
    return parts[parts.length - 1] || base
  }
  const sortByLast = (arr) => [...(arr || [])].sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)))

  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || '').replace('#','').trim().toLowerCase()
      if (VALID_PAGES.has(h)) setPage(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const current = (window.location.hash || '').replace('#','').trim().toLowerCase()
    if (current !== page) window.location.hash = page
  }, [page])

  // Holdings for portfolio editor (name, ticker, shares, value)
  const [holdings, setHoldings] = useState([])
  const [calcHoldings, setCalcHoldings] = useState([])
  const [offlineMode, setOfflineMode] = useState(false)
  // Fallback mapping removed (unused)

  // Preserve last known values/prices while waiting for API recalculation
  const mergeCalcHoldings = (base, prev) => {
    const prevMap = new Map((prev || []).map(h => [String(h.ticker || '').toUpperCase().trim(), h]))
    return (base || []).map(b => {
      const t = String(b.ticker || '').toUpperCase().trim()
      if (t === 'CASH') {
        const cashVal = Math.round(Number(b.shares) || 0)
        return {
          name: b.name,
          ticker: t,
          shares: 0,
          value: cashVal,
          weight: 0,
          pricePerShare: 1,
        }
      }
      const ph = prevMap.get(t) || {}
      return {
        name: b.name,
        ticker: t,
        shares: Math.round(Number(b.shares) || 0),
        value: typeof ph.value === 'number' ? ph.value : null,
        weight: 0,
        pricePerShare: typeof ph.pricePerShare === 'number' ? ph.pricePerShare : null,
      }
    })
  }

  // Merge incoming calc results, only overwrite when new value/price is non-null
  const mergeNonNullCalc = (incoming, prev) => {
    const prevMap = new Map((prev || []).map(h => [String(h.ticker || '').toUpperCase().trim(), h]))
    const merged = (incoming || []).map(h => {
      const t = String(h.ticker || '').toUpperCase().trim()
      const ph = prevMap.get(t) || {}
      const value = (typeof h.value === 'number') ? h.value : (typeof ph.value === 'number' ? ph.value : null)
      const pricePerShare = (typeof h.pricePerShare === 'number') ? h.pricePerShare : (typeof ph.pricePerShare === 'number' ? ph.pricePerShare : null)
      return {
        name: h.name,
        ticker: t,
        shares: Math.round(Number(h.shares) || 0),
        value,
        pricePerShare,
        weight: 0,
      }
    })
    const total = merged.reduce((acc, it) => acc + (typeof it.value === 'number' ? it.value : 0), 0)
    return merged.map(it => ({
      ...it,
      weight: total > 0 && typeof it.value === 'number' ? Math.round((it.value / total) * 1000) / 10 : 0,
    }))
  }

  // New: compute effective holdings using defaultPrice fallback (and CASH logic)
  const computeEffectiveHoldings = (base, calc) => {
    const baseMap = new Map((base || []).map(b => [String(b.ticker || '').toUpperCase().trim(), b]))
    return (calc || []).map(h => {
      const t = String(h.ticker || '').toUpperCase().trim()
      const b = baseMap.get(t) || {}
      const isCash = t === 'CASH' || String(h.name || '').toLowerCase().includes('cash')
      let pricePerShare = typeof h.pricePerShare === 'number' ? h.pricePerShare : (typeof b.defaultPrice === 'number' ? b.defaultPrice : null)
      let value = typeof h.value === 'number' ? h.value : null
      if (isCash) {
        pricePerShare = 1
        value = Math.round(Number(b.shares) || 0)
      } else if (value == null && typeof pricePerShare === 'number') {
        value = Math.round((pricePerShare * (Number(h.shares) || 0)))
      }
      return {
        name: h.name,
        ticker: t,
        shares: Math.round(Number(h.shares) || 0),
        pricePerShare,
        value,
      }
    })
  }

  const [newHolding, setNewHolding] = useState({ name: '', ticker: '', shares: 0, exchange: '', defaultPrice: '' })
  const [editIndex, setEditIndex] = useState(null)
  const [editType, setEditType] = useState(null) // 'shares' | 'cash'
  const [editInput, setEditInput] = useState('')
const [exchanges, setExchanges] = useState([])
useEffect(() => {
  let cancelled = false
  ;(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/exchanges`)
      const data = await parseJsonResponse(res)
      if (!cancelled && Array.isArray(data.exchanges)) setExchanges(data.exchanges)
    } catch (err) {
      console.warn('Failed to load exchanges', err)
    }
  })()
  return () => { cancelled = true }
}, [])

  const formatCurrency = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
  const formatPrice = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  // Derived display state driven by calcHoldings with defaultPrice fallback
  const effectiveHoldings = computeEffectiveHoldings(holdings, calcHoldings)
  const totalValue = effectiveHoldings.reduce((acc, h) => acc + (typeof h.value === 'number' ? Number(h.value) : 0), 0)

  // Robust JSON parsing helper
  async function parseJsonResponse(res) {
    let text = ''
    try {
      text = await res.text()
    } catch (err) {
      console.warn('Failed to read response text', err)
      return {}
    }
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch (err) {
      console.warn('Response is not valid JSON', err)
      return {}
    }
  }

  // New: expose loadHoldings for AdminDefaultsButton onDone and for initial mount
  const loadHoldings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/holdings`)
      const data = await parseJsonResponse(res)
      const base = Array.isArray(data.holdings) ? data.holdings : []
      setHoldings(base)
      setCalcHoldings(prev => mergeCalcHoldings(base, prev))
    } catch (err) {
      console.warn('Load persisted holdings failed:', err)
    }
  }, [])
  async function persistHoldings(base) {
    try {
      if (!adminAuthed || !adminToken) {
        alert('Sign in as admin to persist portfolio changes. Your local changes will not be saved to the backend until you are authenticated.')
        return false
      }
      const cleaned = base.map(h => ({
        name: String(h.name || '').trim(),
        ticker: String(h.ticker || '').toUpperCase().trim(),
        shares: Math.max(0, Math.round(Number(h.shares) || 0)),
        exchange: String(h.exchange || '').toUpperCase().trim(),
        defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined),
      }))
      const res = await fetch(`${API_BASE}/api/holdings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': (adminToken || '').trim() },
        body: JSON.stringify({ holdings: cleaned }),
      })
      const data = await parseJsonResponse(res)
      if (!res.ok) {
        console.warn('Persist holdings failed with status', res.status, data)
        alert(data?.message || 'Persist holdings failed')
        return false
      }
      // Reload persisted holdings to confirm backend sync
      await loadHoldings()
      return true
    } catch (err) {
      console.warn('Persist holdings failed', err)
      alert('Persist holdings failed — please check that the backend is running and your admin token is correct.')
      return false
    }
  }

  // Persist news items (admin only)
  async function persistNews(items) {
    try {
      if (!adminAuthed || !adminToken) throw new Error('Admin not authenticated')
      const cleaned = items.map(n => ({
        title: String(n.title || '').trim().slice(0, 200),
        date: String(n.date || '').trim().slice(0, 100),
        body: String(n.body || '').trim().slice(0, 2000),
      })).filter(n => n.title && n.body)
      const res = await fetch(`${API_BASE}/api/news`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': (adminToken || '').trim() },
        body: JSON.stringify({ news: cleaned }),
      })
      const data = await parseJsonResponse(res)
      if (!res.ok) {
        console.warn('Persist news failed with status', res.status, data)
        return false
      }
      return true
    } catch (err) {
      console.warn('Persist news failed', err)
      return false
    }
  }

  const [news, setNews] = useState([])

  // Load news from backend on mount
  useEffect(() => {
    let cancelled = false
    async function loadNews() {
      try {
        const res = await fetch(`${API_BASE}/api/news`)
        if (!res.ok) throw new Error('Failed to load news')
        const data = await parseJsonResponse(res)
        const items = Array.isArray(data.news) ? data.news : []
        if (cancelled) return
        setNews(items)
      } catch (err) {
        console.warn('Load news failed:', err)
      }
    }
    loadNews()
    return () => { cancelled = true }
  }, [])

  // Research members input is now captured via a single textarea in the Admin Reports form

  // Placeholder exampleReports removed; only uploaded reports will be shown
  useEffect(() => {
    let attempts = 0
    async function loadReports() {
      try {
        const res = await fetch(`${API_BASE}/api/reports`)
        if (!res.ok) throw new Error('Failed to load reports')
        const data = await parseJsonResponse(res)
        setReportsList(data.reports || [])
      } catch {
        attempts += 1
        if (attempts <= 5) {
          setTimeout(loadReports, 2000)
        } else {
          setReportsList([])
        }
      }
    }
    loadReports()
  }, [])

  async function handleAdminLogin(e) {
    e.preventDefault()
    try {
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { 'x-admin-token': (adminToken || '').trim() },
      })
      if (!res.ok) throw new Error('Invalid token')
      const data = await parseJsonResponse(res)
      if (data?.ok) {
        setAdminAuthed(true)
        localStorage.setItem('ADMIN_AUTH', 'true')
        localStorage.setItem('ADMIN_TOKEN', (adminToken || '').trim())
      } else {
        throw new Error('Invalid token')
      }
    } catch (err) {
      alert(err.message || 'Authentication failed')
      setAdminAuthed(false)
      localStorage.removeItem('ADMIN_AUTH')
    }
  }

  async function handleAdminUpload(e) {
    e.preventDefault()
    setUploadMessage('')
    if (!adminAuthed || !adminToken) {
      setUploadMessage('Please sign in as admin before uploading.')
      return
    }
    const formEl = e.currentTarget
    const file = formEl.reportFile?.files?.[0]
    const stockName = formEl.stockName?.value?.trim()
    const reportType = formEl.reportType?.value?.trim().toLowerCase()
    const description = formEl.description?.value?.trim()
    const reportDate = formEl.reportDate?.value?.trim()
    const membersText = formEl.researchMembersText?.value || ''
    const members = membersText.split('\n').map(s => s.trim()).filter(Boolean).join(',')
    const allowedTypes = ['trim','buy','sell']
    if (!file || !stockName || !description || !members || !allowedTypes.includes(reportType)) {
      setUploadMessage('Please complete all required fields and choose a valid report type.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('report', file)
      form.append('reportName', stockName)
      form.append('stockTicker', (formEl.stockTicker?.value || '').toUpperCase().trim())
      form.append('reportType', reportType)
      form.append('researchMembers', members)
      form.append('description', description)
      if (reportDate) form.append('reportDate', reportDate)
      const res = await fetch(`${API_BASE}/api/reports/upload`, {
        method: 'POST',
        headers: { 'x-admin-token': (adminToken || '').trim() },
        mode: 'cors',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || 'Upload failed')
      }
      setUploadMessage('Upload successful!')
      formEl.reset()
      const listRes = await fetch(`${API_BASE}/api/reports`)
      const listData = await parseJsonResponse(listRes)
      setReportsList(listData.reports || [])
    } catch (error) {
      setUploadMessage(error?.message === 'Failed to fetch' || error?.name === 'TypeError' ? `Network error: ensure the backend server is running on ${API_BASE} and CORS is allowed.` : (error.message || 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteReport(filename) {
    if (!adminAuthed) return alert('Sign in as admin to remove reports.')
    if (!confirm('Remove this report?')) return
    try {
      const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': (adminToken || '').trim() },
      })
      if (!res.ok) throw new Error('Failed to remove report')
      const listRes = await fetch(`${API_BASE}/api/reports`)
      const listData = await parseJsonResponse(listRes)
      setReportsList(listData.reports || [])
    } catch (err) {
      alert(err.message || 'Remove failed')
    }
  }

  async function addNews(e) {
    e.preventDefault()
    if (!adminAuthed || !adminToken) {
      alert('Sign in as admin to add news.')
      return
    }
    const formEl = e.currentTarget
    const t = formEl.elements.namedItem('newsTitle')?.value?.trim()
    const d = formEl.elements.namedItem('newsDate')?.value?.trim()
    const i = formEl.elements.namedItem('newsIndustry')?.value?.trim()
    const b = formEl.elements.namedItem('newsBody')?.value?.trim()
    if (!t || !b) return
    const item = { title: t, date: d || '', industry: i || 'General', body: b }
    const prev = news
    const next = [item, ...news]
    setNews(next)
    const ok = await persistNews(next)
    if (ok) {
      try {
        const res = await fetch(`${API_BASE}/api/news`)
        const data = await parseJsonResponse(res)
        const items = Array.isArray(data.news) ? data.news : next
        setNews(items)
      } catch (err) {
        console.warn('Reload news after persist failed:', err)
      }
      formEl?.reset()
    } else {
      setNews(prev)
      alert('Failed to persist news. Please check your admin token and try again.')
    }
  }

  async function addHolding(e) {
    e.preventDefault()
    // Update addHolding usage
    const prevBase = holdings
    const { name, ticker, shares, exchange, defaultPrice } = newHolding
    const dp = parseFloat(defaultPrice)
    const nextBase = [
      { name, ticker: ticker.toUpperCase().trim(), shares: Math.round(Number(shares)), exchange: String(exchange || '').toUpperCase().trim(), defaultPrice: (Number.isFinite(dp) ? dp : undefined) },
      ...holdings.map(h => ({ name: h.name, ticker: String(h.ticker || '').toUpperCase().trim(), shares: Number(h.shares) || 0, exchange: String(h.exchange || '').toUpperCase().trim(), defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined) }))
    ]
    // Optimistic update
    setHoldings(nextBase)
    setCalcHoldings(prev => mergeCalcHoldings(nextBase, prev))
    try {
      const res = await fetch(`${API_BASE}/api/holdings/calc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: nextBase })
      })
      if (!res.ok) throw new Error(`Calculation failed (${res.status})`)
      const data = await parseJsonResponse(res)
      if (!data || !data.ok || !Array.isArray(data.holdings)) throw new Error(data?.error || 'Calculation failed')
      setCalcHoldings(prev => mergeNonNullCalc(data.holdings, prev))
      setOfflineMode(false)
      setNewHolding({ name: '', ticker: '', shares: 0, exchange: '', defaultPrice: '' })
      // persist holdings after successful calc
      const ok = await persistHoldings(nextBase)
      if (!ok) {
        // revert
        setHoldings(prevBase)
        setCalcHoldings(prev => mergeCalcHoldings(prevBase, prev))
      }
    } catch (err) {
      console.warn('Add holding calc failed:', err)
      setOfflineMode(true)
      alert(err?.message || 'Add holding failed — using offline fallback')
      setNewHolding({ name: '', ticker: '', shares: 0, exchange: '', defaultPrice: '' })
    }
  }

  const holdingsRef = useRef(holdings)
  useEffect(() => { holdingsRef.current = holdings }, [holdings])

  useEffect(() => {
    const recalc = async () => {
      const current = holdingsRef.current || []
      if (!current.length) { setOfflineMode(false); return }
      try {
        const payload = { holdings: current.map(h => ({ name: h.name, ticker: String(h.ticker || '').toUpperCase().trim(), shares: Number(h.shares) || 0, exchange: String(h.exchange || '').toUpperCase().trim(), defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined) })) }
        const res = await fetch(`${API_BASE}/api/holdings/calc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error(`Calculation failed (${res.status})`)
        const data = await parseJsonResponse(res)
        if (data && data.ok && Array.isArray(data.holdings)) {
          setCalcHoldings(prev => mergeNonNullCalc(data.holdings, prev))
          setOfflineMode(false)
        } else {
          throw new Error('Invalid calc response')
        }
      } catch (err) {
        console.warn('Periodic recalculation failed:', err)
        setCalcHoldings(prev => mergeCalcHoldings(current, prev))
        setOfflineMode(true)
      }
    }
    recalc()
    const id = setInterval(recalc, 5000)
    return () => clearInterval(id)
  }, [])

  // Load persisted holdings on mount
  useEffect(() => {
    loadHoldings()
  }, [loadHoldings])

  function editHoldingShares(index) {
    const current = holdings[index]
    setEditIndex(index)
    setEditType('shares')
    setEditInput(String(current.shares || 0))
  }

  function editCashAmount(index) {
    const current = holdings[index]
    setEditIndex(index)
    setEditType('cash')
    setEditInput(String(current.shares || 0))
  }

  function cancelEdit() {
    setEditIndex(null)
    setEditType(null)
    setEditInput('')
  }

  function handlePortfolioLogin(e) {
    e.preventDefault()
    const pw = String(portfolioPassword || '').trim()
    if (pw === 'investmentclub') {
      setPortfolioAuthed(true)
      localStorage.setItem('PORTFOLIO_AUTH', 'true')
      setPortfolioPassword('')
    } else {
      alert('Incorrect password')
    }
  }

  async function saveEdit() {
    if (editIndex === null || !editType) return
    const val = Number(editInput)
    if (!Number.isFinite(val) || val < 0) return
    const prevHoldings = holdings
    const next = holdings.map((h, i) => {
      if (i !== editIndex) return h
      if (editType === 'cash') return { ...h, shares: Math.round(val) }
      return { ...h, shares: Math.round(val) }
    })
    // Optimistic update
    setHoldings(next)
    setCalcHoldings(prev => mergeCalcHoldings(next, prev))
    try {
      const res = await fetch(`${API_BASE}/api/holdings/calc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: next.map(h => ({ name: h.name, ticker: String(h.ticker || '').toUpperCase().trim(), shares: Number(h.shares) || 0, exchange: String(h.exchange || '').toUpperCase().trim(), defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined) })) })
      })
      if (!res.ok) throw new Error(`Calculation failed (${res.status})`)
      const data = await parseJsonResponse(res)
      if (!data || !data.ok || !Array.isArray(data.holdings)) throw new Error(data?.error || 'Calculation failed')
      setCalcHoldings(prev => mergeNonNullCalc(data.holdings, prev))
      setOfflineMode(false)
      cancelEdit()
      // persist holdings after successful calc
      const ok = await persistHoldings(next)
      if (!ok) {
        // revert
        setHoldings(prevHoldings)
        setCalcHoldings(prev => mergeCalcHoldings(prevHoldings, prev))
      }
    } catch (err) {
      console.warn('Edit holding calc failed:', err)
      setOfflineMode(true)
      alert(err?.message || 'Edit failed — using offline fallback')
    }
  }

  async function removeHolding(i) {
    const prevHoldings = holdings.slice()
    const next = holdings.slice()
    next.splice(i, 1)
    // Optimistic update
    setHoldings(next)
    setCalcHoldings(prev => mergeCalcHoldings(next, prev))
    try {
      const res = await fetch(`${API_BASE}/api/holdings/calc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdings: next.map(h => ({ name: h.name, ticker: String(h.ticker || '').toUpperCase().trim(), shares: Number(h.shares) || 0, exchange: String(h.exchange || '').toUpperCase().trim(), defaultPrice: (typeof h.defaultPrice === 'number' ? h.defaultPrice : undefined) })) })
      })
      if (!res.ok) throw new Error(`Calculation failed (${res.status})`)
      const data = await parseJsonResponse(res)
      if (!data || !data.ok || !Array.isArray(data.holdings)) throw new Error(data?.error || 'Calculation failed')
      setCalcHoldings(prev => mergeNonNullCalc(data.holdings, prev))
      setOfflineMode(false)
      // persist holdings after successful calc
      const ok = await persistHoldings(next)
      if (!ok) {
        // revert
        setHoldings(prevHoldings)
        setCalcHoldings(prev => mergeCalcHoldings(prevHoldings, prev))
      }
    } catch (err) {
      console.warn('Remove holding calc failed:', err)
      setOfflineMode(true)
      alert(err?.message || 'Remove failed — using offline fallback')
    }
  }

  // Update admin portfolio form to remove value input and display price derived info after API
  async function removeNews(i) {
    if (!adminAuthed) return alert('Sign in as admin to remove news.')
    if (!confirm('Remove this news item?')) return
    try {
      const res = await fetch(`${API_BASE}/api/news/${i}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': (adminToken || '').trim() },
      })
      if (!res.ok) throw new Error('Failed to remove news item')
      const listRes = await fetch(`${API_BASE}/api/news`)
      const listData = await parseJsonResponse(listRes)
      setNews(Array.isArray(listData.news) ? listData.news : [])
    } catch (err) {
      alert(err.message || 'Remove failed')
    }
  }

  function NavButton({ label, target }) {
    const isActive = page === target
    return (
      <button className={`nav-btn ${isActive ? 'active' : ''}`} onClick={() => setPage(target)}>
        {label}
      </button>
    )
  }

  function PieChart({ items }) {
    const size = 240
    const r = 100
    const cx = size / 2
    const cy = size / 2
    const total = items.reduce((acc, it) => acc + it.percent, 0) || 1
    let angle = -90
    const toRad = (deg) => (deg * Math.PI) / 180

    const arcs = items.map((it, i) => {
      const sliceAngle = (it.percent / total) * 360
      const start = { x: cx + r * Math.cos(toRad(angle)), y: cy + r * Math.sin(toRad(angle)) }
      const endAngle = angle + sliceAngle
      const end = { x: cx + r * Math.cos(toRad(endAngle)), y: cy + r * Math.sin(toRad(endAngle)) }
      const largeArc = sliceAngle > 180 ? 1 : 0
      angle = endAngle
      const hue = (i * 57) % 360
      return (
        <path
          key={i}
          d={`M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`}
          fill={`hsl(${hue}deg 70% 50%)`}
          stroke="#fff"
          strokeWidth="1"
        />
      )
    })

    return (
      <div className="pie-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Portfolio weight chart">
          {arcs}
        </svg>
        <ul className="legend">
          {items.map((it, i) => (
            <li className="legend-item" key={i}>
              <span className="legend-swatch" style={{ backgroundColor: `hsl(${(i * 57) % 360}deg 70% 50%)` }} />
              <span className="legend-label">{it.name} - {it.percent}%</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="site">
      <header className="site-header">
        <div className="branding">
          <img src="/logo.png" alt="Investment Club logo" className="logo-img" />
          <div>
            <h1 className="site-title">Eton College & Holyport College Investment Club</h1>
            <p className="site-subtitle">Student-led investing in public markets</p>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          <NavButton label="About Us" target="about" />
          <NavButton label="News" target="news" />
          <NavButton label="Portfolio" target="portfolio" />
          <NavButton label="Stock Reports" target="reports" />
          <NavButton label="Investment Award" target="challenge" />
          <NavButton label="Challenge Signup" target="signup" />
          <button className="admin-trigger" onClick={() => setAdminOpen(true)}>Admin</button>
        </nav>
      </header>

      <main className="site-main">
        {page === 'about' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">About the Eton College and Holyport College Investment Club</h2>
            <p className="section-text">
              Founded in 2015, the Eton College and Holyport College Investment Club (ECHCIC) is a unique, student-run fund managing a real-money portfolio valued at approximately £50,000. Established as a charitable enterprise, the Club was created to provide a practical, real-world environment for students from both schools to learn about investing, finance, and portfolio management.
            </p>

            <h3 className="section-subtitle">Our Ethos: Education, Partnership, and Philanthropy</h3>
            <div className="cards">
              <article className="card">
                <h3 className="card-title">Practical Education</h3>
                <p className="card-body">To provide hands-on experience in equity analysis, research, and investment decision-making within a real market environment.</p>
              </article>
              <article className="card">
                <h3 className="card-title">Genuine Partnership</h3>
                <p className="card-body">To foster a collaborative community between Eton and Holyport College students, working together towards a common goal.</p>
              </article>
              <article className="card">
                <h3 className="card-title">Social Impact</h3>
                <p className="card-body">To operate as a charitable enterprise, donating 50% of our annual profits to Holyport College, with the remaining 50% reinvested to grow the fund.</p>
              </article>
            </div>

            <h3 className="section-subtitle">Our Structure: Student-Led, Advisor-Guided</h3>
            <p className="section-text">
              The Club is entirely student-run. A 15-member Internal Board, comprising Executive Officers and Sector Leaders from both Eton and Holyport, holds sole voting power on all trades. They are supported by Research Analysts who conduct in-depth analysis and present stock recommendations. This entire process is guided, but not directed, by an external Advisory Board of finance professionals who provide feedback and oversight, ensuring a rigorous and educational experience for all members.
            </p>
            <section id="the-team" className="section" style={{ paddingTop: 20 }}>
              <h2 className="section-title">The Team</h2>
              <div className="team-group">
                <h3 className="section-subtitle">Leadership</h3>
                <ul className="report-list">
                  {sortByLast([...(team.ceo||[]), ...(team.coo||[]), ...(team.cfo||[]), ...(team.outreach||[])]).map((m, i) => (
                    <li key={`ldr-${i}`} className="report-item">
                      <span>
                        <strong>{m.name}</strong>{m.role && <> — <span className="muted">{m.role}</span></>}{m.email && <> — <a className="link" href={`mailto:${m.email}`}>{m.email}</a></>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="team-group">
                <h3 className="section-subtitle">Board</h3>
                <ul className="report-list">
                  {sortByLast(team.board).map((m, i) => (
                    <li key={`bd-${i}`} className="report-item">
                      <span>
                        <strong>{m.name}</strong> — <span className="muted">{m.sector}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="team-group">
                <h3 className="section-subtitle">Advisors</h3>
                <ul className="report-list">
                  {sortByLast(team.advisors).map((m, i) => (
                    <li key={`adv-${i}`} className="report-item">
                      <span>
                        <strong>{m.name}</strong> — <span className="muted">Advisor</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </motion.section>
        )}

        {page === 'signup' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">Signup</h2>
            <p className="section-text" style={{ fontSize: '1.25em' }}>Thank you for taking the time to sign up for this year’s Investment Prize under the ECHCIC. Please start by reading the documents below on how to fill out your application:</p>
            <nav className="tabs" role="tablist" aria-label="Challenge documents">
              {challengeDocs.map(d => (
                <button
                  key={d.key}
                  className={`tab-btn ${docTab === d.key ? 'active' : ''}`}
                  role="tab"
                  aria-selected={docTab === d.key}
                  onClick={() => setDocTab(d.key)}
                >
                  {d.label}
                </button>
              ))}
              {(() => {
                const idx = challengeDocs.findIndex(d => d.key === docTab)
                if (idx !== -1 && idx < challengeDocs.length - 1) {
                  return (
                    <button
                      className="tab-btn next-btn"
                      onClick={() => setDocTab(challengeDocs[idx + 1].key)}
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--accent)',
                        borderBottom: 'none',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'rgba(var(--accent-rgb, 0,123,255),0.08)',
                        transition: 'background .2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(var(--accent-rgb, 0,123,255),0.16)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(var(--accent-rgb, 0,123,255),0.08)'}
                      aria-label="Next document"
                    >
                      Next <span style={{ fontSize: '1.5em', lineHeight: 1, fontWeight: 900 }}>→</span>
                    </button>
                  )
                }
                return null
              })()}
            </nav>
            <div className="tab-content">
              {(() => {
                const active = challengeDocs.find(d => d.key === docTab) || challengeDocs[0]
                const docUrl = `${API_BASE}/uploads/docs/${encodeURIComponent(active.file)}`
                return (
                  <article className="card">
                    <h3 className="card-title">{active.label}</h3>
                    <p className="card-body" style={{ fontSize: '1.2em' }}>{active.blurb}</p>
                    <div style={{ marginTop: '12px' }}>
                      <iframe title={active.label} src={docUrl} style={{ width: '100%', height: '600px', border: '1px solid var(--border)', borderRadius: '12px' }} />
                    </div>
                  </article>
                )
              })()}
            </div>
          </motion.section>
        )}

        {page === 'news' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">News</h2>
            {(() => {
              const grouped = news.reduce((acc, n) => {
                const ind = n.industry || 'General'
                if (!acc[ind]) acc[ind] = []
                acc[ind].push(n)
                return acc
              }, {})
              const industries = Object.keys(grouped).sort()
              return (
                <div className="industry-groups">
                  {industries.length === 0 && <p className="muted">No news available.</p>}
                  {industries.map(ind => (
                    <div key={ind} className="industry-group" style={{ marginBottom: '2rem' }}>
                      <h3 className="section-subtitle" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{ind}</h3>
                      <div className="cards">
                        {grouped[ind].map((n, i) => (
                          <article className="card" key={`${ind}-${i}`}>
                            <h3 className="card-title">{n.title}</h3>
                            <p className="card-meta">{n.date}</p>
                            <p className="card-body">{n.body}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </motion.section>
        )}

        {page === 'challenge' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">The ECHCIC Investment Award 2026</h2>
            <p className="section-text">
              See the{' '}
              <a className="link" href="#signup" style={{ fontSize: '1.1em', fontWeight: 600 }}>
                Challenge Signup
              </a>{' '}
              page for more details.
            </p>

            <h3 className="section-subtitle">Introduction</h3>

            <p>
              The ECHCIC Investment Award offers students the chance to showcase their financial literacy and investment skills in a 
              simulated market environment. Teams will design and execute 3-month strategies while discovering how complex financial markets work, 
              and why disciplined risk management matters. 
            </p>

            <p>
              In its second year, the competition awards roughly £1,000 in prizes 
              to the top performers and is open to over a dozen secondary schools in the UK. 
            </p>
            <h3 className="section-subtitle">Digital Overview for Partner Schools</h3>

            <div className="challenge-text">
              <article className="challenge-card mission-card">
                <h3 className="section-subtitle">Mission</h3>
                <p>
                  We aim to provide a professionally structured introduction to public investing for students across UK secondary schools. 
                  The competition mirrors real-world investment practice by requiring teams to: 
                </p>
                <ul className="challenge-bullets">
                  <li>Develop and submit an investment strategy</li>
                  <li>Implement it over a (limited) long-term period</li>
                  <li>Evaluate performance, articulate lessons learned, and present their strategy to a professional judging panel</li>
                </ul>
                <p>
                  The competition cultivates disciplined analysis, risk management, and careful decision-making with real consequences. Through strategy submissions, performance tracking, and a final presentation round, students build the analytical, quantitative, and communication skills expected in modern investment roles. 
                </p>
                <p>
                  Our broader objective is to help form responsible young investors who can engage with financial markets and economic issues with clarity and sound judgment. 
                </p>
              </article>

              <article className="challenge-card structure-card">
                <h3 className="section-subtitle">Competition Structure</h3>
                <ol className="challenge-steps">
                  <li className="challenge-step">
                    <div className="challenge-step-title">Registration</div>
                    <ul>
                      <li>Teams of 2–4 students submit:</li>
                      <li>A Google Form registration including a 1–2 page investment strategy summary</li>
                      <li>A selection of up to three equities, diversified by sector</li>
                      <li>The judging panel and student committee will jointly select 50 teams to enter the live competition.</li>
                    </ul>
                  </li>
                  <li className="challenge-step">
                    <div className="challenge-step-title">Platform & Portfolio Tracking</div>
                    <ul>
                      <li>All selected teams receive a paper portfolio mirroring their submitted strategy.</li>
                      <li>Members of the student committee oversee the digital platform infrastructure, ensuring:</li>
                      <li>Access to portfolio dashboards</li>
                      <li>Real-time tracking</li>
                      <li>Comparative performance displays</li>
                      <li>Public-facing prize information for transparency</li>
                      <li>Weekly briefings summarising market events and portfolio impacts will be written and circulated by the student team.</li>
                    </ul>
                  </li>
                  <li className="challenge-step">
                    <div className="challenge-step-title">Strategy Adjustments During the Competition</div>
                    <ul>
                      <li>Teams may request portfolio changes during the competition by submitting a short written explanation. The student committee will review these within a few days. </li>
                      <li>Note: the quality, not the frequency, of adjustments matters.</li>
                      <li>We may also introduce sudden shifts, which candidates must adapt to over the three months. Hence, candidates must be alert via email.</li>
                    </ul>
                  </li>
                  <li className="challenge-step">
                    <div className="challenge-step-title">Final Presentations</div>
                    <ul>
                      <li>After the trading period, all 50 portfolios will be reviewed. Judges and student committee members will select the top 15–20 teams.</li>
                      <li>These teams will deliver a 5-minute presentation at Eton College (expected venue: Jafar Hall). Presentations cover:</li>
                      <li>Their original thesis</li>
                      <li>Portfolio evolution</li>
                      <li>Performance drivers</li>
                      <li>Key lessons</li>
                      <li>Judges then select the winners.</li>
                    </ul>
                  </li>
                </ol>
              </article>
            </div>

            <h3 className="section-subtitle">Judging Panel (2026)</h3>
            <div className="cards">
              <article className="card">
                <h4 className="card-title">Anne-Christine Farstad — Global Equity Portfolio Manager, MFS Investment Management</h4>
                <p className="card-body">
                  Anne-Christine Farstad is a senior portfolio manager at MFS, responsible for final buy/sell decisions, risk management, and portfolio construction within their contrarian equity strategies. She joined MFS in 2005 and is recognised as one of the UK's leading female portfolio managers. Her value-investing discipline and long-term analytical approach provide deep insight for student strategies.
                </p>
              </article>
              <article className="card">
                <h4 className="card-title">Mr Peter Davies — Fund Manager, Lansdowne Partners</h4>
                <p className="card-body">
                  Mr Davies is a veteran fund manager at Lansdowne Partners, one of London’s most high-profile hedge funds. Having joined in 2001, he has decades of experience in global equity markets, macro-driven strategy, and risk-adjusted portfolio construction. His background at Merrill Lynch/Mercury Asset Management further deepens the expertise he brings to evaluating student investment theses.
                </p>
              </article>
              <article className="card">
                <h4 className="card-title">Matthew Wood — Lancaster Investment Management</h4>
                <p className="card-body">
                  Matthew Wood has experience in fund monitoring, operations, and risk-control processes within boutique investment environments. His operational perspective ensures that student strategies are judged not only on profitability and thesis quality but also on real-world implementability.
                </p>
              </article>
            </div>

            <h3 className="section-subtitle">Awards — The Gundlach Investment Prize</h3>
            <p>Thanks to the generosity of former Etonian Henry Gundlach (Georgetown University McDonough School of Business), the prize fund for 2026 is substantial (£1000 to be given out).</p>
            <p>The Gundlach Prizes are awarded for 50% strategy and 50% performance.</p>
            <p>Prize distribution will be finalised closer to the date.</p>
          </motion.section>
        )}

        {page === 'portfolio' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">Our Portfolio</h2>
            {!portfolioAuthed ? (
              <form className="upload-form auth-form" onSubmit={handlePortfolioLogin} style={{ maxWidth: '480px' }}>
                <p className="helper-text">Enter password to view the portfolio.</p>
                <div className="form-row">
                  <label htmlFor="portfolioPassword">Password</label>
                  <input id="portfolioPassword" name="portfolioPassword" type="password" value={portfolioPassword} onChange={(e) => setPortfolioPassword(e.target.value)} required />
                </div>
                <div className="actions">
                  <button className="primary-btn" type="submit">Unlock</button>
                </div>
              </form>
            ) : (
              <>
                {offlineMode && <p className="muted">Offline mode: using local holdings; values/prices may be unavailable.</p>}
                <div className="value-display" aria-live="polite">Total Portfolio Value: {formatCurrency(totalValue)}</div>
                {(() => {
                  const sortedHoldings = [...effectiveHoldings].sort((a, b) => {
                    const va = typeof a.value === 'number' ? a.value : -Infinity
                    const vb = typeof b.value === 'number' ? b.value : -Infinity
                    return vb - va
                  })
                  const items = sortedHoldings.map(h => ({
                    name: `${h.name}${h.ticker ? ` (${h.ticker})` : ''}`,
                    percent: typeof h.value === 'number' && totalValue > 0 ? Math.round(((h.value) / totalValue) * 1000) / 10 : 0,
                    value: typeof h.value === 'number' ? h.value : null,
                    shares: Number(h.shares) || 0,
                    pricePerShare: typeof h.pricePerShare === 'number' ? h.pricePerShare : null,
                  }))
                  return (
                    <div className="portfolio-row">
                      <div className="grid">
                        {sortedHoldings.map((h, i) => {
                          const hasValue = typeof h.value === 'number'
                          const percent = hasValue && totalValue > 0 ? Math.round(((h.value) / totalValue) * 1000) / 10 : 0
                          const pricePerShare = typeof h.pricePerShare === 'number' ? h.pricePerShare : null
                          const name = `${h.name}${h.ticker ? ` (${h.ticker})` : ''}`
                          const isCash = String(h.ticker || '').toUpperCase() === 'CASH' || String(h.name || '').toLowerCase().includes('cash')
                          const valueText = hasValue ? formatCurrency(h.value) : (isCash ? formatCurrency(0) : 'N/A')
                          const priceText = pricePerShare != null ? formatPrice(pricePerShare) : 'N/A'
                          return (
                            <article className="card" key={`${h.ticker}-${i}`}>
                              <h3 className="card-title">{name}</h3>
                              <p className="card-meta">Weight: {percent}%</p>
                              <p className="card-body">Value: {valueText}</p>
                              {!isCash && <p className="card-body">Shares: {Number(h.shares) || 0}</p>}
                              {!isCash && <p className="card-body">Price per Share: {priceText}</p>}
                            </article>
                          )
                        })}
                      </div>
                      <div className="chart-col">
                        <PieChart items={items} />
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </motion.section>
        )}

        {page === 'reports' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="section">
            <h2 className="section-title">Stock Reports</h2>
            <div className="cards" style={{ marginBottom: '2rem' }}></div>
            <ul className="report-list">
              {reportsList.length === 0 && <li className="muted">No reports yet.</li>}
              {reportsList.map((r) => {
                const company = (r.title || r.stockName || r.originalName || '').toString().trim()
                const ticker = (r.ticker || '').toString().trim().toUpperCase()
                const type = (r.reportType || '').toString().trim().toLowerCase()
                const cleanTitle = company && type ? `${company} ${type.charAt(0).toUpperCase()}${type.slice(1)} Report` : (company || r.filename)
                const membersStr = Array.isArray(r.members) ? r.members.join(', ') : (r.members || '')
                return (
                  <li key={r.filename} className="report-item">
                    <article className="card">
                      <h3 className="card-title">{cleanTitle}</h3>
                      {ticker && <p className="card-meta">{company} {ticker ? `(${ticker})` : ''}</p>}
                      {membersStr && <p className="card-body">{membersStr}</p>}
                      {r.description && <p className="card-body">{r.description}</p>}
                      <p className="card-meta">{r.date || new Date(r.timestamp).toLocaleDateString()}</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a className="link" href={`${API_BASE}/api/reports/download/${encodeURIComponent(r.filename)}`} target="_blank" rel="noreferrer">Download</a>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          </motion.section>
        )}
      </main>

      {adminOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Admin Panel">
          <div className="modal-panel">
            <div className="modal-header">
              <h3>{adminAuthed ? 'Admin Panel' : 'Admin Sign In'}</h3>
              <button className="close-btn" onClick={() => setAdminOpen(false)} aria-label="Close">×</button>
            </div>

            {!adminAuthed ? (
              <form className="upload-form auth-form" onSubmit={handleAdminLogin}>
                <p className="helper-text">Enter your admin token to continue.</p>
                <div className="form-row input-with-toggle">
                  <label htmlFor="adminToken">Admin token</label>
                  <div className="input-wrap">
                    <input
                      id="adminToken"
                      name="adminToken"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter admin token"
                      value={adminToken}
                      onChange={(e) => setAdminToken(e.target.value)}
                      aria-required="true"
                    />
                    <button type="button" className="input-toggle" onClick={() => setShowPassword(v => !v)} aria-label="Toggle visibility">
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="actions">
                  <button className="primary-btn" type="submit">Sign In</button>
                  <button type="button" className="secondary-btn" onClick={() => setAdminOpen(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <nav className="tabs" role="tablist" aria-label="Admin sections">
                  <button
                    className={`tab-btn ${adminTab === 'news' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={adminTab === 'news'}
                    onClick={() => setAdminTab('news')}
                  >
                    News
                  </button>
                  <button
                    className={`tab-btn ${adminTab === 'portfolio' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={adminTab === 'portfolio'}
                    onClick={() => setAdminTab('portfolio')}
                  >
                    Portfolio
                  </button>
                  <button
                    className={`tab-btn ${adminTab === 'reports' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={adminTab === 'reports'}
                    onClick={() => setAdminTab('reports')}
                  >
                    Reports
                  </button>
                </nav>
                <div className="tab-content">
                  {adminTab === 'news' && (
                    <section className="admin-section" role="tabpanel" aria-label="News Management">
                      <h4 className="section-subtitle">News Management</h4>
                      <form className="upload-form" onSubmit={addNews}>
                        <div className="form-row">
                          <label htmlFor="newsTitle">Title</label>
                          <input id="newsTitle" name="newsTitle" type="text" required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="newsDate">Date</label>
                          <input id="newsDate" name="newsDate" type="text" placeholder="e.g., October 2025" />
                        </div>
                        <div className="form-row">
                          <label htmlFor="newsIndustry">Industry</label>
                          <select id="newsIndustry" name="newsIndustry" required>
                            <option value="">Select...</option>
                            <option value="Technology">Technology</option>
                            <option value="Finance">Finance</option>
                            <option value="Healthcare">Healthcare</option>
                            <option value="Energy">Energy</option>
                            <option value="Consumer Staples">Consumer Staples</option>
                            <option value="Industrials">Industrials</option>
                            <option value="Real Estate">Real Estate</option>
                            <option value="Utilities">Utilities</option>
                            <option value="General">General</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label htmlFor="newsBody">Body</label>
                          <textarea id="newsBody" name="newsBody" rows="3" required />
                        </div>
                        <div className="actions">
                          <button className="primary-btn" type="submit">Add News</button>
                        </div>
                      </form>
                      <ul className="report-list" style={{ marginTop: '12px' }}>
                        {news.map((item, i) => (
                          <li key={i} className="report-item">
                            <span><strong>{item.title}</strong> — <span className="muted">{item.industry || 'General'}</span> — <span className="muted">{item.date}</span></span>
                            <div className="actions">
                              <button className="secondary-btn" onClick={() => removeNews(i)}>Remove</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {adminTab === 'portfolio' && (
                    <section className="admin-section" role="tabpanel" aria-label="Portfolio Editor">
                      <h4 className="section-subtitle">Portfolio Editor</h4>
                      <div className="actions" style={{ marginBottom: '8px' }}>
                        <AdminDefaultsButton adminToken={adminToken} onDone={loadHoldings} />
                      </div>
                      <div className="form-row">
                        <div className="value-display" aria-live="polite">Total Portfolio Value: {formatCurrency(totalValue)}</div>
                      </div>
                      <form className="upload-form" onSubmit={addHolding}>
                        <div className="form-row">
                          <label htmlFor="stockNameInput">Stock Name</label>
                          <input id="stockNameInput" type="text" value={newHolding.name} onChange={(e) => setNewHolding({ ...newHolding, name: e.target.value })} required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="stockTickerInput">Stock Ticker</label>
                          <input id="stockTickerInput" type="text" value={newHolding.ticker} onChange={(e) => setNewHolding({ ...newHolding, ticker: e.target.value.toUpperCase() })} required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="sharesInput">Number of Shares</label>
                          <input id="sharesInput" type="number" min="0" step="1" value={newHolding.shares} onChange={(e) => setNewHolding({ ...newHolding, shares: Number(e.target.value || 0) })} required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="exchangeSelect">Exchange</label>
                          <select id="exchangeSelect" value={newHolding.exchange} onChange={(e) => setNewHolding({ ...newHolding, exchange: (e.target.value || '').toUpperCase() })}>
                            <option value="">Select exchange</option>
                            {exchanges.map(ex => (
                              <option key={ex.code} value={ex.code}>{ex.name} ({ex.code})</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-row">
                          <label htmlFor="defaultPriceInput">Default Price (GBP)</label>
                          <input id="defaultPriceInput" type="number" min="0" step="0.01" placeholder="Optional" value={newHolding.defaultPrice} onChange={(e) => setNewHolding({ ...newHolding, defaultPrice: e.target.value })} />
                        </div>
                        <div className="actions">
                          <button className="primary-btn" type="submit">Add Holding</button>
                        </div>
                      </form>
                      <ul className="report-list" style={{ marginTop: '12px' }}>
                        {holdings.map((h, i) => {
                          const ch = calcHoldings.find(x => String(x.ticker || '').toUpperCase() === String(h.ticker || '').toUpperCase()) || {}
                          const isCash = String(h.ticker).toUpperCase() === 'CASH' || String(h.name).toLowerCase().includes('cash')
                          const displayValue = typeof ch.value === 'number' ? ch.value : (typeof h.defaultPrice === 'number' ? Math.round(h.defaultPrice * (Number(h.shares) || 0)) : null)
                          const displayPrice = typeof ch.pricePerShare === 'number' ? ch.pricePerShare : (typeof h.defaultPrice === 'number' ? h.defaultPrice : null)
                          const weight = totalValue > 0 && typeof displayValue === 'number' ? Math.round((displayValue / totalValue) * 1000) / 10 : 0
                          return (
                            <li key={`${h.ticker}-${i}`} className="report-item">
                              <span>
                                <strong>{h.name}</strong> — <span className="muted">{h.ticker}</span>
                                <br />
                                <span className="muted">Value: {typeof displayValue === 'number' ? formatCurrency(displayValue) : 'N/A'}{!isCash ? ` • Shares: ${h.shares} • Price: ${displayPrice != null ? formatPrice(displayPrice) : 'N/A'}` : ''}</span>
                                <br />
                                <span className="muted">Weight: {weight}%</span>
                              </span>
                              {editIndex === i ? (
                                <div className="inline-edit" style={{ marginTop: '8px' }}>
                                  <label style={{ marginRight: 8 }}>{String(h.ticker).toUpperCase() === 'CASH' ? 'Cash Amount' : 'Number of Shares'}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step={String(h.ticker).toUpperCase() === 'CASH' ? '1' : '1'}
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    style={{ marginRight: 8 }}
                                  />
                                  <div className="actions">
                                    <button className="primary-btn" type="button" onClick={saveEdit}>Save</button>
                                    <button className="secondary-btn" type="button" onClick={cancelEdit}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="actions">
                                  <button
                                    className="secondary-btn"
                                    onClick={() => (String(h.ticker).toUpperCase() === 'CASH' ? editCashAmount(i) : editHoldingShares(i))}
                                    title={String(h.ticker).toUpperCase() === 'CASH' ? 'Edit cash amount' : 'Edit shares'}
                                  >
                                    Edit
                                  </button>
                                  <button className="secondary-btn" onClick={() => removeHolding(i)}>Remove</button>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}
                  {adminTab === 'reports' && (
                    <section className="admin-section" role="tabpanel" aria-label="Upload Stock Report">
                      <h4 className="section-subtitle">Upload Stock Report</h4>

                      <form className="upload-form" onSubmit={handleAdminUpload}>
                        <div className="form-row">
                          <label htmlFor="stockName">Stock Name</label>
                          <input id="stockName" name="stockName" type="text" required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="stockTicker">Stock Ticker</label>
                          <input id="stockTicker" name="stockTicker" type="text" placeholder="e.g., AAPL" required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="reportType">Report Type</label>
                          <select id="reportType" name="reportType" required>
                            <option value="">Select...</option>
                            <option value="trim">Trim</option>
                            <option value="buy">Buy</option>
                            <option value="sell">Sell</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label htmlFor="reportDate">Report Date</label>
                          <input id="reportDate" name="reportDate" type="date" />
                        </div>
                        <div className="form-row">
                          <label htmlFor="description">Description</label>
                          <textarea id="description" name="description" rows="3" required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="researchMembersText">Research Members (one per line)</label>
                          <textarea id="researchMembersText" name="researchMembersText" rows="4" placeholder="Enter one member per line" required />
                        </div>
                        <div className="form-row">
                          <label htmlFor="reportFile">File Upload (PDF/DOCX)</label>
                          <input id="reportFile" name="reportFile" type="file" accept=".pdf,.doc,.docx" required />
                        </div>
                        <div className="actions">
                          <button className="primary-btn" type="submit" disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Upload Report'}
                          </button>
                        </div>
                        {uploadMessage && <p className="status">{uploadMessage}</p>}
                      </form>
                      <h4 className="section-subtitle" style={{ marginTop: '16px' }}>Existing Reports</h4>
                      <ul className="report-list">
                        {reportsList.length === 0 && <li className="muted">No reports yet.</li>}
                        {reportsList.map((r) => (
                          <li key={r.filename} className="report-item">
                            <span>
                              <strong>{r.stockName || r.title || r.originalName}</strong>
                              {r.reportType && <> — <span className="muted">{String(r.reportType).toUpperCase()}</span></>}
                              {Array.isArray(r.members) && r.members.length > 0 && <> — <span className="muted">{r.members.join(', ')}</span></>}
                              {!Array.isArray(r.members) && r.members && <> — <span className="muted">{String(r.members)}</span></>}
                              {r.description && <>
                                <br />
                                <span className="muted">{r.description}</span>
                              </>}
                              <br />
                              <span className="muted">{r.date || new Date(r.timestamp).toLocaleDateString()}</span>
                            </span>
                            <div className="actions">
                              <a className="link" href={`${API_BASE}/api/reports/download/${encodeURIComponent(r.filename)}`} target="_blank" rel="noreferrer">Download</a>
                              <button className="secondary-btn" onClick={() => handleDeleteReport(r.filename)}>Remove</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="site-footer">
        <p>© 2025 Eton College and Holyport College Investment Club | Built by Aaran Nihalani</p>
      </footer>
    </div>
  )
}

export default App

// Update AdminDefaultsButton to accept props
function AdminDefaultsButton({ adminToken, onDone }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className="secondary-btn" disabled={busy} onClick={async () => {
      try {
        setBusy(true)
        const res = await fetch(`${API_BASE}/api/holdings/defaults`, { method: 'POST', headers: { 'x-admin-token': (adminToken || '').trim() } })
        if (!res.ok) throw new Error('Failed to populate default prices')
        if (typeof onDone === 'function') await onDone()
      } catch (err) {
        alert(err?.message || 'Defaults population failed')
      } finally {
        setBusy(false)
      }
    }}>
      {busy ? 'Populating...' : 'Populate Default Prices'}
    </button>
  )
}
