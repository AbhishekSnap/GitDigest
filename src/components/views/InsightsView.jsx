import { useState, useEffect, useMemo, useRef } from 'react'
import { Chart, BarElement, BarController, CategoryScale, LinearScale, Tooltip, LineController, LineElement, PointElement } from 'chart.js'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchAllCommits, fetchAllPRs } from '../../api/github.js'
import { generateProjectOverview } from '../../api/anthropic.js'
import { detectType, timeAgo, avatarColor, avatarInitial, COLORS, TYPE_COLORS, esc } from '../../utils/index.js'

Chart.register(BarElement, BarController, CategoryScale, LinearScale, Tooltip, LineController, LineElement, PointElement)

function InsEmpty({ msg }) {
  return (
    <div className="ins-empty">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      {msg}
    </div>
  )
}

function chartColors(isLight) {
  return {
    grid:        isLight ? 'rgba(0,0,0,0.07)'          : 'rgba(255,255,255,0.06)',
    text:        isLight ? '#9A9080'                    : '#444E5E',
    tipBg:       isLight ? '#E6E1D9'                    : '#1A1F2A',
    tipBorder:   isLight ? 'rgba(0,0,0,0.13)'          : 'rgba(255,255,255,0.11)',
    tipText:     isLight ? '#1A1714'                    : '#EDE9E3',
    gold:        isLight ? 'rgba(150,113,31,0.75)'     : 'rgba(201,168,76,0.75)',
    goldBorder:  isLight ? 'rgba(130,95,20,0.85)'      : 'rgba(201,168,76,0.9)',
    teal:        isLight ? 'rgba(13,122,112,0.85)'     : 'rgba(45,212,191,0.85)',
    tealBorder:  isLight ? 'rgba(10,100,90,0.9)'       : 'rgba(45,212,191,1)',
  }
}

function baseOptions(c, extraScales = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 260 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tipBg,
        titleColor: c.tipText,
        bodyColor: c.tipText,
        borderColor: c.tipBorder,
        borderWidth: 1,
        padding: { x: 10, y: 7 },
        cornerRadius: 5,
        displayColors: false,
        titleFont: { size: 12, weight: 500 },
        bodyFont: { size: 11, weight: 400 },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: c.text, font: { size: 11, weight: 400 }, maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 18 },
        ...extraScales.x,
      },
      y: {
        border: { display: false },
        grid: { color: c.grid },
        ticks: { color: c.text, font: { size: 12, weight: 400 }, precision: 0 },
        ...extraScales.y,
      },
    },
  }
}

// ── Commit Velocity ───────────────────────────────────────────────────────────
function VelocityChart({ commits }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const { isLight } = useStore()

  const { keys, vals } = useMemo(() => {
    const weeks = {}
    commits.forEach(c => {
      const d = new Date(c.commit.author.date)
      const sun = new Date(d); sun.setDate(d.getDate() - d.getDay())
      const k = sun.toISOString().slice(0, 10)
      weeks[k] = (weeks[k] || 0) + 1
    })
    let keys = Object.keys(weeks).sort()
    let vals = keys.map(k => weeks[k])
    if (keys.length > 52) {
      const months = {}
      keys.forEach((k, i) => { const mk = k.slice(0, 7); months[mk] = (months[mk] || 0) + vals[i] })
      keys = Object.keys(months).sort()
      vals = keys.map(k => months[k])
    }
    return { keys, vals }
  }, [commits])

  useEffect(() => {
    if (!canvasRef.current || !keys.length) return
    chartRef.current?.destroy()
    const c = chartColors(isLight)
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: keys.map(k => k.slice(5)),
        datasets: [{
          data: vals,
          backgroundColor: c.gold,
          borderColor: c.goldBorder,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.9,
        }],
      },
      options: {
        ...baseOptions(c),
        plugins: {
          ...baseOptions(c).plugins,
          tooltip: {
            ...baseOptions(c).plugins.tooltip,
            callbacks: {
              title: items => keys[items[0].dataIndex]?.slice(5) ?? '',
              label: item => `${Math.round(item.raw)} commits`,
            },
          },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [keys, vals, isLight])

  if (!commits.length) return <InsEmpty msg="No commits in range" />
  return (
    <div style={{ position: 'relative', width: '100%', height: '280px' }}>
      <canvas ref={canvasRef} role="img" aria-label="Commit velocity by week or month" />
    </div>
  )
}

// ── Day of Week ───────────────────────────────────────────────────────────────
function DOWChart({ commits }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const { isLight } = useStore()

  const { counts, total } = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    commits.forEach(c => { counts[(new Date(c.commit.author.date).getDay() + 6) % 7]++ })
    return { counts, total: counts.reduce((a, b) => a + b, 0) }
  }, [commits])

  useEffect(() => {
    if (!canvasRef.current || !total) return
    chartRef.current?.destroy()
    const c = chartColors(isLight)
    const peakIdx = counts.indexOf(Math.max(...counts))
    const bgColors = counts.map((_, i) => i === peakIdx ? c.gold.replace('0.75', '0.9') : c.gold)
    const bdColors = counts.map((_, i) => i === peakIdx ? c.goldBorder : c.goldBorder.replace('0.9', '0.6'))

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          data: counts,
          backgroundColor: bgColors,
          borderColor: bdColors,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.85,
          categoryPercentage: 0.9,
        }],
      },
      options: {
        ...baseOptions(c, { x: { ticks: { color: c.text, font: { size: 11, weight: 400 }, maxRotation: 0 } } }),
        plugins: {
          ...baseOptions(c).plugins,
          tooltip: {
            ...baseOptions(c).plugins.tooltip,
            callbacks: {
              title: items => items[0].label,
              label: item => {
                const pct = total ? Math.round(item.raw / total * 100) : 0
                return `${Math.round(item.raw)} commits · ${pct}% of week`
              },
            },
          },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [counts, total, isLight])

  if (!commits.length) return <InsEmpty msg="No commits in range" />
  return (
    <div style={{ position: 'relative', width: '100%', height: '220px' }}>
      <canvas ref={canvasRef} role="img" aria-label="Commits by day of week" />
    </div>
  )
}

// ── Avg PR Merge Time ─────────────────────────────────────────────────────────
function PRMergeTrendChart({ prs }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)
  const { isLight } = useStore()

  const { keys, vals, counts } = useMemo(() => {
    const merged = prs.filter(p => p.merged_at)
    if (merged.length < 2) return { keys: [], vals: [], counts: [] }
    const weeks = {}
    merged.forEach(p => {
      const d = new Date(p.merged_at)
      const sun = new Date(d); sun.setDate(d.getDate() - d.getDay())
      const k = sun.toISOString().slice(0, 10)
      if (!weeks[k]) weeks[k] = { sum: 0, n: 0 }
      weeks[k].sum += (new Date(p.merged_at) - new Date(p.created_at)) / 86400000
      weeks[k].n++
    })
    const keys = Object.keys(weeks).sort()
    const vals   = keys.map(k => +(weeks[k].sum / weeks[k].n).toFixed(2))
    const counts = keys.map(k => weeks[k].n)
    return { keys, vals, counts }
  }, [prs])

  useEffect(() => {
    if (!canvasRef.current || keys.length < 2) return
    chartRef.current?.destroy()
    const c = chartColors(isLight)

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: keys.map(k => k.slice(5)),
        datasets: [{
          data: vals,
          borderColor: c.teal,
          borderWidth: 2,
          pointBackgroundColor: c.tealBorder,
          pointBorderColor: 'transparent',
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.3,
        }],
      },
      options: {
        ...baseOptions(c, {
          y: {
            border: { display: false },
            grid: { color: c.grid },
            ticks: {
              color: c.text,
              font: { size: 12, weight: 400 },
              callback: v => `${v}d`,
            },
          },
        }),
        plugins: {
          ...baseOptions(c).plugins,
          tooltip: {
            ...baseOptions(c).plugins.tooltip,
            callbacks: {
              title: items => `wk ${keys[items[0].dataIndex]?.slice(5) ?? ''}`,
              label: item => `${item.raw.toFixed(1)}d avg · ${counts[item.dataIndex]} PR${counts[item.dataIndex] !== 1 ? 's' : ''}`,
            },
          },
        },
      },
    })
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [keys, vals, counts, isLight])

  if (prs.filter(p => p.merged_at).length < 2) return <InsEmpty msg="Need 2+ merged PRs" />
  return (
    <div style={{ position: 'relative', width: '100%', height: '260px' }}>
      <canvas ref={canvasRef} role="img" aria-label="Average PR merge time by week" />
    </div>
  )
}

// ── Static chart helpers (unchanged) ─────────────────────────────────────────
function renderTypeDonut(commits) {
  if (!commits.length) return `<div class="ins-empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>No commits in range</div>`
  const counts = {}
  commits.forEach(c => { const t = detectType(c.commit.message); counts[t] = (counts[t] || 0) + 1 })
  const total = commits.length
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const R = 44, CX = 60, CY = 60, SW = 18
  let angle = -Math.PI / 2
  const slices = entries.map(([t, n]) => {
    const sweep = n / total * Math.PI * 2
    const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle)
    angle += sweep
    const x2 = CX + R * Math.cos(angle), y2 = CY + R * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return `<path d="M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} Z" fill="${TYPE_COLORS[t] || 'var(--text3)'}" opacity=".85"/>`
  }).join('')
  const legend = entries.map(([t, n]) =>
    `<div class="leg-item"><div class="leg-dot" style="background:${TYPE_COLORS[t] || 'var(--text3)'}"></div><span>${esc(t)}</span><span style="margin-left:auto;font-family:var(--mono);color:var(--text3)">${Math.round(n / total * 100)}%</span></div>`
  ).join('')
  return `<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
    <svg viewBox="0 0 120 120" style="width:120px;flex-shrink:0">${slices}
      <circle cx="${CX}" cy="${CY}" r="${R - SW}" fill="var(--s1)"/>
      <text x="${CX}" y="${CY - 5}" text-anchor="middle" class="donut-center">${total}</text>
      <text x="${CX}" y="${CY + 10}" text-anchor="middle" class="donut-center-sub">commits</text>
    </svg>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px;min-width:120px">${legend}</div>
  </div>`
}

function renderHODChart(commits) {
  if (!commits.length) return `<div class="ins-empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>No commits in range</div>`
  const counts = new Array(24).fill(0)
  commits.forEach(c => { counts[new Date(c.commit.author.date).getHours()]++ })
  const max = Math.max(1, ...counts)
  const peakH = counts.indexOf(max)
  const bars = counts.map((n, h) =>
    `<div class="hod-bar${n === max ? ' peak' : ''}" style="height:${Math.max(4, Math.round(n / max * 100))}%" data-tip="${h}:00 — ${n} commit${n !== 1 ? 's' : ''}"></div>`
  ).join('')
  const labels = [0, 6, 12, 18, 23].map(h =>
    `<div style="font-size:8px;color:var(--text3);font-family:var(--mono);flex:${h === 0 ? 1 : h === 23 ? 1 : 5};text-align:${h === 0 ? 'left' : h === 23 ? 'right' : 'center'}">${h}:00</div>`
  ).join('')
  return `<div class="hod-bar-wrap">${bars}</div><div style="display:flex">${labels}</div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px">Peak: <span style="color:var(--gold)">${peakH}:00–${peakH + 1}:00</span> (${max} commits)</div>`
}

function renderPRFunnel(prs) {
  if (!prs.length) return `<div class="ins-empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>No PRs in range</div>`
  const open = prs.filter(p => p.state === 'open').length
  const merged = prs.filter(p => p.merged_at).length
  const closed = prs.filter(p => p.state === 'closed' && !p.merged_at).length
  const max = Math.max(1, open, merged, closed)
  return [
    { label: 'Open', n: open, color: 'var(--teal)' },
    { label: 'Merged', n: merged, color: 'var(--gold)' },
    { label: 'Closed', n: closed, color: 'var(--text3)' },
  ].map(r => `<div class="funnel-row">
    <span class="funnel-label">${r.label}</span>
    <div class="funnel-track"><div class="funnel-fill" style="width:${Math.round(r.n / max * 100)}%;background:${r.color}"></div></div>
    <span class="funnel-count" style="color:${r.color}">${r.n}</span>
  </div>`).join('')
}

// ── Project Overview Modal ────────────────────────────────────────────────────
function OverviewModal({ onClose }) {
  const { API, currentRepo } = useStore()
  const toast = useToast()
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState('Fetching commit history…')

  useEffect(() => { generate() }, [])

  async function generate() {
    setLoading(true)
    try {
      const data = await generateProjectOverview(API, currentRepo, msg => setProgress(msg))
      setResult(data)
    } catch (e) {
      if (e.message === 'no-key') {
        useStore.getState().switchView('settings')
        toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
        onClose()
      } else {
        toast('❌', 'Overview failed', e.message)
        onClose()
      }
    } finally { setLoading(false) }
  }

  return (
    <div id="onboarding-modal" className="open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ob-inner">
        <button className="ob-close" onClick={onClose}>✕</button>
        <div id="onboarding-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="ai-thinking">
                <div className="ai-thinking-msg">{progress}</div>
                <div className="ai-dots">
                  <div className="ai-dot"></div><div className="ai-dot"></div><div className="ai-dot"></div>
                </div>
              </div>
            </div>
          ) : result ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{currentRepo?.name || 'Project Overview'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{currentRepo?.full_name || ''}</div>
                </div>
                {currentRepo?.language && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '4px 10px', borderRadius: 'var(--r-pill)', background: 'var(--s3)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{currentRepo.language}</span>
                )}
              </div>
              {result.project_type && <div className="ob-section"><div className="ob-section-label">What is this project?</div><div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{result.project_type}</div></div>}
              {result.tech_stack?.length > 0 && <div className="ob-section"><div className="ob-section-label">Tech Stack</div><div>{result.tech_stack.map(t => <span key={t} className="ob-tag">{t}</span>)}</div></div>}
              {result.key_modules?.length > 0 && <div className="ob-section"><div className="ob-section-label">Key Areas</div><div>{result.key_modules.map(m => <span key={m} className="ob-tag">{m}</span>)}</div></div>}
              {result.evolution && <div className="ob-section"><div className="ob-section-label">How it evolved</div><div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{result.evolution}</div></div>}
              {result.team_structure && <div className="ob-section"><div className="ob-section-label">Team</div><div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{result.team_structure}</div></div>}
              {result.recent_focus?.length > 0 && (
                <div className="ob-section">
                  <div className="ob-section-label">Recent Focus</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {result.recent_focus.map((f, i) => <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', alignItems: 'flex-start' }}><span style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }}>◆</span>{f}</div>)}
                  </div>
                </div>
              )}
              {result.onboarding_tips?.length > 0 && (
                <div className="ob-section">
                  <div className="ob-section-label">Onboarding Tips</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.onboarding_tips.map((t, i) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text2)', padding: '10px 12px', background: 'var(--s2)', borderRadius: 8 }}><span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--teal)', flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>{t}</div>)}
                  </div>
                </div>
              )}
              {result.health_snapshot && (
                <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                  <div className="ob-section-label" style={{ marginBottom: 8 }}>Codebase Health</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{result.health_snapshot}</div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Main InsightsView ─────────────────────────────────────────────────────────
export default function InsightsView() {
  const { API, commitDetailCache, currentRepo, isLight } = useStore()
  const toast = useToast()
  const [insCommits, setInsCommits] = useState(null)
  const [insPRs, setInsPRs]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [days, setDays]             = useState(0)
  const [author, setAuthor]         = useState('')
  const [contribSort, setContribSort] = useState({ key: 'commits', dir: -1 })
  const [showOverview, setShowOverview] = useState(false)

  useEffect(() => {
    if (!API || insCommits !== null) return
    loadData()
  }, [API])

  async function loadData() {
    setLoading(true)
    try {
      const [ac, ap] = await Promise.all([fetchAllCommits(API), fetchAllPRs(API)])
      setInsCommits(ac)
      setInsPRs(ap)
    } catch { setInsCommits([]); setInsPRs([]) }
    finally { setLoading(false) }
  }

  const cutoff = days ? new Date(Date.now() - days * 86400000) : null
  const filteredCommits = useMemo(() => {
    if (!insCommits) return []
    return insCommits.filter(c => {
      if (cutoff && new Date(c.commit.author.date) < cutoff) return false
      if (author && c.commit.author.name !== author) return false
      return true
    })
  }, [insCommits, days, author, cutoff])

  const filteredPRs = useMemo(() => {
    if (!insPRs) return []
    return insPRs.filter(p => !cutoff || new Date(p.created_at) >= cutoff)
  }, [insPRs, days, cutoff])

  const authors = useMemo(() => [...new Set((insCommits || []).map(c => c.commit.author.name))].sort(), [insCommits])

  const prevCutoff    = days ? new Date(Date.now() - 2 * days * 86400000) : null
  const prevCutoffEnd = days ? new Date(Date.now() - days * 86400000) : null
  const prevCs = days ? (insCommits || []).filter(c => {
    const d = new Date(c.commit.author.date)
    return d >= prevCutoff && d < prevCutoffEnd
  }) : []
  const delta = prevCs.length ? Math.round((filteredCommits.length - prevCs.length) / prevCs.length * 100) : null

  const mergedPRs = filteredPRs.filter(p => p.merged_at)
  const avgMerge  = mergedPRs.length
    ? (mergedPRs.reduce((s, p) => s + (new Date(p.merged_at) - new Date(p.created_at)) / 86400000, 0) / mergedPRs.length).toFixed(1)
    : null
  const activeAuthors = new Set(filteredCommits.map(c => c.commit.author.name)).size

  const contribData = useMemo(() => {
    const data = {}
    ;(insCommits || []).forEach(c => {
      const a = c.commit.author.name
      if (author && a !== author) return
      if (!data[a]) data[a] = { name: a, commits: 0, period: 0, additions: 0, deletions: 0, recent: c.commit.author.date, weeks: new Array(8).fill(0) }
      data[a].commits++
      if (!cutoff || new Date(c.commit.author.date) >= cutoff) data[a].period++
      if (new Date(c.commit.author.date) > new Date(data[a].recent)) data[a].recent = c.commit.author.date
      const daysAgo = Math.floor((Date.now() - new Date(c.commit.author.date)) / 86400000)
      const wk = Math.floor(daysAgo / 7)
      if (wk < 8) data[a].weeks[wk]++
    })
    for (const [sha, d] of commitDetailCache.entries()) {
      const a = d.commit?.author?.name
      if (a && data[a]) { data[a].additions += (d.stats?.additions || 0); data[a].deletions += (d.stats?.deletions || 0) }
    }
    const rows = Object.values(data)
    rows.sort((a, b) => {
      const av = a[contribSort.key], bv = b[contribSort.key]
      return (av > bv ? 1 : -1) * contribSort.dir
    })
    return rows
  }, [insCommits, author, days, contribSort, commitDetailCache.size])

  const fileHeatmap = useMemo(() => {
    const counts = {}
    commitDetailCache.forEach(d => { (d.files || []).forEach(f => { counts[f.filename] = (counts[f.filename] || 0) + 1 }) })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [commitDetailCache.size])

  if (loading) {
    return (
      <div className="view active" id="view-insights">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
          <div className="ai-thinking">
            <div className="ai-thinking-msg">Fetching full commit &amp; PR history…</div>
            <div className="ai-dots" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div className="ai-dot" style={{ animationDelay: '0s' }}></div>
              <div className="ai-dot" style={{ animationDelay: '.2s' }}></div>
              <div className="ai-dot" style={{ animationDelay: '.4s' }}></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view active" id="view-insights">
      {showOverview && <OverviewModal onClose={() => setShowOverview(false)} />}

      {/* Filters */}
      <div className="ins-filters">
        <div style={{ display: 'flex', gap: 6 }}>
          {[[7,'7d'],[30,'30d'],[60,'60d'],[0,'All time']].map(([d, label]) => (
            <button key={d} className={`ftab${days === d ? ' active' : ''}`} onClick={() => setDays(d)}>{label}</button>
          ))}
        </div>
        <div className="ins-filters-right">
          <select className="ins-author-sel" value={author} onChange={e => setAuthor(e.target.value)}>
            <option value="">All contributors</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={() => setShowOverview(true)} style={{ fontSize: 12, color: 'var(--gold)', borderColor: 'rgba(201,168,76,.3)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Project Overview
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="ins-kpi-row" id="ins-kpi-row">
        {[
          { label: 'Commits', value: filteredCommits.length, sub: `in ${days || 'all'} days`, color: 'var(--gold)',
            extra: delta !== null ? (delta > 0 ? `<div class="ins-kpi-delta delta-up">↑ ${delta}% vs prev period</div>` : delta < 0 ? `<div class="ins-kpi-delta delta-down">↓ ${Math.abs(delta)}% vs prev period</div>` : '') : '' },
          { label: 'Active Devs', value: activeAuthors, sub: 'contributors', color: 'var(--teal)' },
          { label: 'PRs', value: filteredPRs.length, sub: `${mergedPRs.length} merged`, color: 'var(--blue)' },
          { label: 'Avg Merge Time', value: avgMerge !== null ? avgMerge + 'd' : '—', sub: 'open → merge', color: 'var(--amber)' },
        ].map(k => (
          <div key={k.label} className="ins-kpi" style={{ '--accent-color': k.color }}>
            <div className="ins-kpi-label">{k.label}</div>
            <div className="ins-kpi-value">{k.value}</div>
            <div className="ins-kpi-sub">{k.sub}</div>
            {k.extra && <div dangerouslySetInnerHTML={{ __html: k.extra }}></div>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="insights-grid">
        <div className="ip full">
          <div className="ip-header">
            <div><div className="ip-title">Commit Velocity</div><div className="ip-sub">Commits per {filteredCommits.length > 364 ? 'month' : 'week'}</div></div>
            <span className="ip-badge">{filteredCommits.length} commits</span>
          </div>
          <VelocityChart commits={filteredCommits} />
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Commit Type Breakdown</div><div className="ip-sub">Detected from message prefixes</div></div></div>
          <div dangerouslySetInnerHTML={{ __html: renderTypeDonut(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Hour of Day</div><div className="ip-sub">When does work happen?</div></div></div>
          <div dangerouslySetInnerHTML={{ __html: renderHODChart(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Day of Week</div><div className="ip-sub">Peak commit days</div></div></div>
          <DOWChart commits={filteredCommits} />
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">PR Funnel</div><div className="ip-sub">Open · Merged · Closed</div></div></div>
          <div dangerouslySetInnerHTML={{ __html: renderPRFunnel(filteredPRs) }}></div>
        </div>

        <div className="ip full">
          <div className="ip-header"><div><div className="ip-title">Avg PR Merge Time</div><div className="ip-sub">Days from open to merge, by week</div></div></div>
          <PRMergeTrendChart prs={filteredPRs} />
        </div>

        {/* Contributor table */}
        <div className="ip full">
          <div className="ip-header">
            <div><div className="ip-title">Contributor Activity</div><div className="ip-sub">Commits per period · additions · deletions</div></div>
            <span className="ip-badge">{contribData.length} contributor{contribData.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ca-table">
              <thead>
                <tr>
                  <th style={{ width: '36%' }}>Author</th>
                  <th className="ca-num" onClick={() => setContribSort(s => ({ key: 'commits', dir: s.key === 'commits' ? -s.dir : -1 }))} style={{ cursor: 'pointer' }}>Commits</th>
                  {days > 0 && <th className="ca-num" onClick={() => setContribSort(s => ({ key: 'period', dir: s.key === 'period' ? -s.dir : -1 }))} style={{ cursor: 'pointer' }}>In {days}d</th>}
                  <th className="ca-num" onClick={() => setContribSort(s => ({ key: 'additions', dir: s.key === 'additions' ? -s.dir : -1 }))} style={{ cursor: 'pointer' }}>+Lines</th>
                  <th className="ca-num" onClick={() => setContribSort(s => ({ key: 'deletions', dir: s.key === 'deletions' ? -s.dir : -1 }))} style={{ cursor: 'pointer' }}>−Lines</th>
                  <th>Last commit</th>
                  <th>Trend (8w)</th>
                </tr>
              </thead>
              <tbody>
                {contribData.map(r => {
                  const sparkMax = Math.max(1, ...r.weeks)
                  return (
                    <tr key={r.name}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <div className="av" style={{ flexShrink: 0, background: avatarColor(r.name) }}>{avatarInitial(r.name)}</div>
                        <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      </div></td>
                      <td className="ca-num">{r.commits}</td>
                      {days > 0 && <td className="ca-num" style={{ color: r.period ? 'var(--gold)' : 'var(--text3)' }}>{r.period || '—'}</td>}
                      <td className="ca-num" style={{ color: '#4ADE80' }}>{r.additions ? '+' + r.additions : '—'}</td>
                      <td className="ca-num" style={{ color: 'var(--red)' }}>{r.deletions ? '-' + r.deletions : '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text3)' }}>{timeAgo(r.recent)}</td>
                      <td>
                        <div className="ca-spark">
                          {r.weeks.slice().reverse().map((n, i) => (
                            <div key={i} className={`ca-spark-bar${i === r.weeks.length - 1 ? ' active' : ''}`} style={{ height: `${Math.max(10, Math.round(n / sparkMax * 100))}%` }}></div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* File heatmap */}
        <div className="ip full">
          <div className="ip-header"><div><div className="ip-title">File Change Heatmap</div><div className="ip-sub">Most frequently modified files — expand commits to populate</div></div></div>
          <div style={{ paddingTop: 8 }}>
            {fileHeatmap.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Expand commits or PRs to populate this chart</div>
              : (() => {
                  const max = fileHeatmap[0][1]
                  return fileHeatmap.map(([file, count]) => {
                    const pct = Math.round((count / max) * 100)
                    const short = file.split('/').pop()
                    return (
                      <div key={file} className="fheat-row" title={file}>
                        <div className="fheat-name">{short}</div>
                        <div className="fheat-bar-wrap"><div className="fheat-bar" style={{ width: `${pct}%` }}></div></div>
                        <div className="fheat-count">{count}</div>
                      </div>
                    )
                  })
                })()
            }
          </div>
        </div>
      </div>
    </div>
  )
}
