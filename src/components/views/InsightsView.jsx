import { useState, useEffect, useMemo } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchAllCommits, fetchAllPRs } from '../../api/github.js'
import { generateProjectOverview } from '../../api/anthropic.js'
import { detectType, timeAgo, avatarColor, avatarInitial, COLORS, TYPE_COLORS, esc } from '../../utils/index.js'

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

// ── Commit Velocity ───────────────────────────────────────────────────────────
function VelocityChart({ commits }) {
  const [hovered, setHovered] = useState(null)
  if (!commits.length) return <InsEmpty msg="No commits in range" />

  const weeks = {}
  commits.forEach(c => {
    const d = new Date(c.commit.author.date)
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay())
    const k = sun.toISOString().slice(0, 10)
    weeks[k] = (weeks[k] || 0) + 1
  })

  let keys = Object.keys(weeks).sort()
  let vals = keys.map(k => weeks[k])
  let isMonthly = false

  if (keys.length > 52) {
    const months = {}
    keys.forEach((k, i) => {
      const mk = k.slice(0, 7)
      months[mk] = (months[mk] || 0) + vals[i]
    })
    keys = Object.keys(months).sort()
    vals = keys.map(k => months[k])
    isMonthly = true
  }

  const maxV = Math.max(1, ...vals)
  const midV = Math.round(maxV / 2)
  const W = 600, H = 150, PL = 32, PR = 6, PT = 14, PB = 42
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const n = keys.length
  const BW = Math.max(3, Math.min(32, Math.floor(plotW / Math.max(n, 1) * 0.72)))
  const gap = n > 1 ? (plotW - BW * n) / (n - 1) : 0
  const bx = i => PL + i * (BW + gap)
  const bh = v => Math.max(2, Math.round(v / maxV * plotH))
  const by = v => PT + plotH - bh(v)
  const lx = i => bx(i) + BW / 2
  const lblY = H - 4

  const tip = hovered !== null ? {
    x: lx(hovered), y: by(vals[hovered]),
    label: isMonthly ? keys[hovered] : 'wk ' + keys[hovered].slice(5),
    val: vals[hovered],
  } : null

  const ax = { fontSize: 7, fill: 'var(--text3)', fontFamily: 'var(--mono)' }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 280, display: 'block', overflow: 'visible' }}>
      <line x1={PL} y1={PT} x2={W-PR} y2={PT} stroke="var(--border)" strokeWidth="0.4" strokeDasharray="4,4"/>
      <line x1={PL} y1={PT+plotH/2} x2={W-PR} y2={PT+plotH/2} stroke="var(--border)" strokeWidth="0.4" strokeDasharray="4,4"/>

      <text x={PL-4} y={PT+4} textAnchor="end" style={ax}>{maxV}</text>
      <text x={PL-4} y={PT+plotH/2+4} textAnchor="end" style={ax}>{midV}</text>
      <text x={PL-4} y={PT+plotH+4} textAnchor="end" style={ax}>0</text>

      {vals.map((v, i) => {
        const x = bx(i), h = bh(v), y = by(v), cx = lx(i)
        const isH = hovered === i
        return (
          <g key={i} style={{ cursor: 'default' }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <rect x={x-1} y={PT} width={BW+2} height={plotH} fill="transparent"/>
            <rect x={x} y={y} width={BW} height={h} rx="2"
              fill="var(--gold)" opacity={isH ? 1 : v === maxV ? 0.82 : 0.35}/>
            <text x={cx} y={lblY} textAnchor="end"
              transform={`rotate(-45,${cx},${lblY})`}
              style={{ ...ax, fill: isH ? 'var(--gold)' : 'var(--text3)' }}>
              {keys[i].slice(5)}
            </text>
          </g>
        )
      })}

      {tip && (() => {
        const TW = 100, TH = 30
        const tx = Math.min(Math.max(tip.x - TW/2, PL), W-TW-PR)
        const ty = Math.max(tip.y - TH - 8, 2)
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty} width={TW} height={TH} rx={4}
              fill="var(--s1)" stroke="var(--border2)" strokeWidth={1}
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.3))' }}/>
            <text x={tx+TW/2} y={ty+12} textAnchor="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: 'var(--gold)' }}>
              {tip.val} commit{tip.val !== 1 ? 's' : ''}
            </text>
            <text x={tx+TW/2} y={ty+24} textAnchor="middle" style={{ fontSize: 7.5, fill: 'var(--text3)' }}>
              {tip.label}
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── Day of Week ───────────────────────────────────────────────────────────────
function DOWChart({ commits }) {
  const [hovered, setHovered] = useState(null)
  if (!commits.length) return <InsEmpty msg="No commits in range" />

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const counts = [0, 0, 0, 0, 0, 0, 0]
  commits.forEach(c => { counts[(new Date(c.commit.author.date).getDay() + 6) % 7]++ })

  const total = counts.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...counts)
  const peakIdx = counts.indexOf(max)

  const W = 320, H = 110, PL = 26, PR = 6, PT = 12, PB = 18
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const BW = Math.floor(plotW / 7 * 0.58)
  const gap = (plotW - BW * 7) / 6
  const bx = i => PL + i * (BW + gap)
  const bh = v => Math.max(2, Math.round(v / max * plotH))
  const by = v => PT + plotH - bh(v)

  const ax = { fontSize: 7, fill: 'var(--text3)', fontFamily: 'var(--mono)' }

  const tip = hovered !== null ? {
    x: bx(hovered) + BW / 2, y: by(counts[hovered]),
    day: dayNames[hovered], val: counts[hovered],
    pct: total ? Math.round(counts[hovered] / total * 100) : 0,
  } : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      <line x1={PL} y1={PT} x2={W-PR} y2={PT} stroke="var(--border)" strokeWidth="0.4" strokeDasharray="4,4"/>
      <text x={PL-4} y={PT+4} textAnchor="end" style={ax}>{max}</text>

      {dayNames.map((d, i) => {
        const h = bh(counts[i]), y = by(counts[i])
        const isH = hovered === i
        const isPeak = i === peakIdx
        return (
          <g key={d} style={{ cursor: 'default' }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <rect x={bx(i)-4} y={PT} width={BW+8} height={plotH} fill="transparent"/>
            <rect x={bx(i)} y={y} width={BW} height={h} rx="2"
              fill="var(--gold)" opacity={isH ? 1 : isPeak ? 0.82 : 0.35}/>
            <text x={bx(i)+BW/2} y={H-3} textAnchor="middle"
              style={{ ...ax, fill: isPeak && !isH ? 'var(--gold)' : 'var(--text3)' }}>
              {d}
            </text>
            {hovered === null && counts[i] > 0 && (
              <text x={bx(i)+BW/2} y={y-3} textAnchor="middle"
                style={{ fontSize: 7, fill: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                {counts[i]}
              </text>
            )}
          </g>
        )
      })}

      {tip && (() => {
        const TW = 108, TH = 30
        const tx = Math.min(Math.max(tip.x - TW/2, 0), W-TW)
        const ty = Math.max(tip.y - TH - 6, 2)
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty} width={TW} height={TH} rx={4}
              fill="var(--s1)" stroke="var(--border2)" strokeWidth={1}
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.3))' }}/>
            <text x={tx+TW/2} y={ty+12} textAnchor="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: 'var(--gold)' }}>
              {tip.day}: {tip.val}
            </text>
            <text x={tx+TW/2} y={ty+24} textAnchor="middle" style={{ fontSize: 7.5, fill: 'var(--text3)' }}>
              {tip.pct}% of all commits
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

// ── Avg PR Merge Time ─────────────────────────────────────────────────────────
function PRMergeTrendChart({ prs }) {
  const [hovered, setHovered] = useState(null)
  const merged = prs.filter(p => p.merged_at)
  if (merged.length < 2) return <InsEmpty msg="Need 2+ merged PRs" />

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
  const counts = keys.map(k => weeks[k].n)

  const maxV = Math.max(1, ...vals)
  const W = 600, H = 150, PL = 32, PR = 6, PT = 14, PB = 42
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const n = keys.length
  const lblY = H - 4

  const px = i => PL + (i / Math.max(n - 1, 1)) * plotW
  const py = v => PT + plotH - (v / maxV) * plotH
  const pts = vals.map((v, i) => [px(i), py(v)])
  const polyPts = pts.map(p => p.join(',')).join(' ')
  const areaD = n > 1
    ? `M${pts[0][0]},${PT+plotH} ${pts.map(p => `L${p[0]},${p[1]}`).join(' ')} L${pts[n-1][0]},${PT+plotH} Z`
    : ''

  const ax = { fontSize: 7, fill: 'var(--text3)', fontFamily: 'var(--mono)' }

  const tip = hovered !== null ? {
    x: pts[hovered][0], y: pts[hovered][1],
    label: 'wk ' + keys[hovered].slice(5),
    val: vals[hovered], n: counts[hovered],
  } : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="prmt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="var(--teal)" stopOpacity="0"/>
        </linearGradient>
      </defs>

      <line x1={PL} y1={PT} x2={W-PR} y2={PT} stroke="var(--border)" strokeWidth="0.4" strokeDasharray="4,4"/>
      <line x1={PL} y1={PT+plotH/2} x2={W-PR} y2={PT+plotH/2} stroke="var(--border)" strokeWidth="0.4" strokeDasharray="4,4"/>

      <text x={PL-4} y={PT+4} textAnchor="end" style={ax}>{maxV}d</text>
      <text x={PL-4} y={PT+plotH/2+4} textAnchor="end" style={ax}>{(maxV/2).toFixed(1)}d</text>
      <text x={PL-4} y={PT+plotH+4} textAnchor="end" style={ax}>0d</text>

      {areaD && <path d={areaD} fill="url(#prmt-grad)"/>}
      <polyline points={polyPts} fill="none" stroke="var(--teal)" strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round"/>

      {vals.map((v, i) => {
        const cx = pts[i][0]
        const isH = hovered === i
        return (
          <g key={i} style={{ cursor: 'default' }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <circle cx={cx} cy={pts[i][1]} r={9} fill="transparent"/>
            <circle cx={cx} cy={pts[i][1]}
              r={isH ? 4 : 2}
              fill={isH ? 'var(--teal)' : 'var(--s1)'}
              stroke="var(--teal)" strokeWidth={isH ? 0 : 1.5}/>
            <text x={cx} y={lblY} textAnchor="end"
              transform={`rotate(-45,${cx},${lblY})`}
              style={{ ...ax, fill: isH ? 'var(--teal)' : 'var(--text3)' }}>
              {keys[i].slice(5)}
            </text>
          </g>
        )
      })}

      {tip && (() => {
        const TW = 100, TH = 30
        const tx = Math.min(Math.max(tip.x - TW/2, PL), W-TW-PR)
        const ty = Math.max(tip.y - TH - 10, 2)
        return (
          <g pointerEvents="none">
            <rect x={tx} y={ty} width={TW} height={TH} rx={4}
              fill="var(--s1)" stroke="var(--border2)" strokeWidth={1}
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.3))' }}/>
            <text x={tx+TW/2} y={ty+12} textAnchor="middle"
              style={{ fontSize: 11, fontWeight: 700, fill: 'var(--teal)' }}>
              {tip.val}d avg
            </text>
            <text x={tx+TW/2} y={ty+24} textAnchor="middle" style={{ fontSize: 7.5, fill: 'var(--text3)' }}>
              {tip.label} · {tip.n} PR{tip.n !== 1 ? 's' : ''}
            </text>
          </g>
        )
      })()}
    </svg>
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
    `<div class="hod-bar${n === max ? ' peak' : ''}" style="height:${Math.max(4, Math.round(n / max * 100))}%" title="${h}:00 — ${n} commit${n !== 1 ? 's' : ''}"></div>`
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
  const { API, commitDetailCache, currentRepo } = useStore()
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
            <div><div className="ip-title">Commit Velocity</div><div className="ip-sub">Commits per {filteredCommits.length > 364 ? 'month' : 'week'} · hover for exact count</div></div>
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
          <div className="ip-header"><div><div className="ip-title">Day of Week</div><div className="ip-sub">Peak commit days · hover for details</div></div></div>
          <DOWChart commits={filteredCommits} />
        </div>

        <div className="ip">
          <div className="ip-header"><div><div className="ip-title">PR Funnel</div><div className="ip-sub">Open · Merged · Closed</div></div></div>
          <div dangerouslySetInnerHTML={{ __html: renderPRFunnel(filteredPRs) }}></div>
        </div>

        <div className="ip full">
          <div className="ip-header"><div><div className="ip-title">Avg PR Merge Time</div><div className="ip-sub">Days from open to merge, by week · hover for details</div></div></div>
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
