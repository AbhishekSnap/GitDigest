import { useState, useEffect, useMemo } from 'react'
import useStore from '../../store/useStore.js'
import { fetchAllCommits, fetchAllPRs } from '../../api/github.js'
import { detectType, timeAgo, dayKey, avatarColor, avatarInitial, COLORS, TYPE_COLORS, esc } from '../../utils/index.js'

function insEmpty(msg) {
  return `<div class="ins-empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>${msg}</div>`
}

function renderVelocityChart(commits) {
  if (!commits.length) return insEmpty('No commits in range')
  const weeks = {}
  commits.forEach(c => {
    const d = new Date(c.commit.author.date)
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay())
    const k = sun.toISOString().slice(0, 10)
    weeks[k] = (weeks[k] || 0) + 1
  })
  const keys = Object.keys(weeks).sort()
  const vals = keys.map(k => weeks[k])
  const maxV = Math.max(1, ...vals)
  const W = 600, H = 110, PAD_X = 30, PAD_Y = 16
  const BW = Math.max(8, Math.min(32, Math.floor((W - PAD_X * 2) / (keys.length + 1))))
  const gap = keys.length > 1 ? (W - PAD_X * 2 - BW * keys.length) / (keys.length - 1) : 0
  const bx = i => PAD_X + i * (BW + gap)
  const bh = v => Math.max(3, Math.round(v / maxV * (H - PAD_Y * 2)))
  const bars = vals.map((v, i) => {
    const x = bx(i), h = bh(v), y = H - PAD_Y - h
    const isMax = v === maxV
    return `<g><rect x="${x}" y="${y}" width="${BW}" height="${h}" rx="3" fill="${isMax ? 'var(--gold)' : 'var(--gold-dim)'}" opacity="${isMax ? 1 : .75}"/>
      <text x="${x + BW / 2}" y="${H - 2}" text-anchor="middle" class="axis">${keys[i].slice(5)}</text>
      <text x="${x + BW / 2}" y="${y - 3}" text-anchor="middle" class="axis" style="fill:var(--text2)">${v}</text></g>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:300px">${bars}</svg>`
}

function renderTypeDonut(commits) {
  if (!commits.length) return insEmpty('No commits in range')
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
  if (!commits.length) return insEmpty('No commits in range')
  const counts = new Array(24).fill(0)
  commits.forEach(c => { counts[new Date(c.commit.author.date).getHours()]++ })
  const max = Math.max(1, ...counts)
  const peakH = counts.indexOf(max)
  const bars = counts.map((n, h) =>
    `<div class="hod-bar${n === max ? ' peak' : ''}" style="height:${Math.max(4, Math.round(n / max * 100))}%" title="${h}:00 — ${n} commit${n !== 1 ? 's' : ''}"></div>`
  ).join('')
  const labels = [0, 6, 12, 18, 23].map(h =>
    `<div style="font-size:8px;color:var(--text3);font-family:var(--mono);flex:${h === 0 ? 1 : h === 23 ? 1 : 5};text-align:${h === 0 ? 'left' : h === 23 ? 'right' : 'center'}">${h}:00</div>`
  ).join('')
  return `<div class="hod-bar-wrap">${bars}</div><div style="display:flex">${labels}</div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px">Peak: <span style="color:var(--gold)">${peakH}:00–${peakH + 1}:00</span> (${max} commits)</div>`
}

function renderDOWChart(commits) {
  if (!commits.length) return insEmpty('No commits in range')
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const counts = [0, 0, 0, 0, 0, 0, 0]
  commits.forEach(c => { counts[(new Date(c.commit.author.date).getDay() + 6) % 7]++ })
  const max = Math.max(1, ...counts)
  const peakIdx = counts.indexOf(max)
  const W = 260, H = 100, PAD = 20, BW = 24, GAP = 8
  const totalW = days.length * (BW + GAP) - GAP
  const startX = (W - totalW) / 2
  const bars = days.map((d, i) => {
    const bh = Math.max(2, Math.round(counts[i] / max * (H - PAD * 2)))
    const by = H - PAD - bh
    return `<rect x="${startX + i * (BW + GAP)}" y="${by}" width="${BW}" height="${bh}" rx="3" fill="${i === peakIdx ? 'var(--gold)' : 'var(--gold-dim)'}"/>
      <text x="${startX + i * (BW + GAP) + BW / 2}" y="${H - 4}" text-anchor="middle" class="axis">${d}</text>
      ${counts[i] ? `<text x="${startX + i * (BW + GAP) + BW / 2}" y="${by - 3}" text-anchor="middle" class="axis" style="fill:var(--text2)">${counts[i]}</text>` : ''}`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${bars}</svg>`
}

function renderPRFunnel(prs) {
  if (!prs.length) return insEmpty('No PRs in range')
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

function renderPRMergeTrend(prs) {
  const merged = prs.filter(p => p.merged_at)
  if (merged.length < 2) return insEmpty('Need 2+ merged PRs')
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
  const vals = keys.map(k => +(weeks[k].sum / weeks[k].n).toFixed(1))
  const maxV = Math.max(1, ...vals)
  const W = 260, H = 100, PAD = 20
  const x = i => PAD + (i / (keys.length - 1 || 1)) * (W - PAD * 2)
  const y = v => H - PAD - v / maxV * (H - PAD * 2)
  const pts = vals.map((v, i) => [x(i), y(v)])
  const poly = pts.map(p => p.join(',')).join(' ')
  const area = `M${pts[0][0]},${H - PAD} ${pts.map(p => `L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length - 1][0]},${H - PAD} Z`
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <defs><linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--teal)" stop-opacity=".25"/>
      <stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#lg2)"/>
    <polyline points="${poly}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="var(--teal)"/>`).join('')}
    <text x="${PAD}" y="${H}" class="axis">${keys[0].slice(5)}</text>
    <text x="${W - PAD}" y="${H}" text-anchor="end" class="axis">${keys[keys.length - 1].slice(5)}</text>
    <text x="${PAD}" y="${y(maxV) + 4}" class="axis">${maxV}d</text>
  </svg>`
}

export default function InsightsView() {
  const { API, commitDetailCache, currentRepo } = useStore()
  const [insCommits, setInsCommits] = useState(null)
  const [insPRs, setInsPRs]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [days, setDays]             = useState(0)
  const [author, setAuthor]         = useState('')
  const [contribSort, setContribSort] = useState({ key: 'commits', dir: -1 })

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

  // KPIs
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

  // Contrib table
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

  // File heatmap from caches
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
            <div><div className="ip-title">Commit Velocity</div><div className="ip-sub">Commits per week over selected period</div></div>
            <span className="ip-badge" id="vel-badge">{Object.keys((() => { const w = {}; filteredCommits.forEach(c => { const d = new Date(c.commit.author.date); const sun = new Date(d); sun.setDate(d.getDate() - d.getDay()); w[sun.toISOString().slice(0,10)] = 1 }); return w })()).length} weeks</span>
          </div>
          <div id="vel-chart" dangerouslySetInnerHTML={{ __html: renderVelocityChart(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Commit Type Breakdown</div><div className="ip-sub">Detected from message prefixes</div></div></div>
          <div id="type-donut" dangerouslySetInnerHTML={{ __html: renderTypeDonut(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Hour of Day</div><div className="ip-sub">When does work happen?</div></div></div>
          <div id="hod-chart" dangerouslySetInnerHTML={{ __html: renderHODChart(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Day of Week</div><div className="ip-sub">Peak commit days</div></div></div>
          <div id="dow-chart" dangerouslySetInnerHTML={{ __html: renderDOWChart(filteredCommits) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">PR Funnel</div><div className="ip-sub">Open · Merged · Closed</div></div></div>
          <div id="pr-funnel" dangerouslySetInnerHTML={{ __html: renderPRFunnel(filteredPRs) }}></div>
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">Avg PR Merge Time</div><div className="ip-sub">Days from open to merge, by week</div></div></div>
          <div id="pr-merge-trend" dangerouslySetInnerHTML={{ __html: renderPRMergeTrend(filteredPRs) }}></div>
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
          <div id="file-heatmap-body" style={{ paddingTop: 8 }}>
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
