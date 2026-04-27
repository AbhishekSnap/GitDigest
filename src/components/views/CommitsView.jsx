import { useState, useEffect, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchCommitsPage, fetchCommitDetail, PAGE_SIZE_COMMITS } from '../../api/github.js'
import { analyzeCommit } from '../../api/anthropic.js'
import {
  timeAgo, fmtDate, dayKey, avatarColor, avatarInitial,
  detectType, typeCls, riskCls,
  hasSecurityTouch, renderPlainSummary, renderTechImpact,
  renderRiskBadge, renderQualityBadge, renderDiff, COLORS, TYPE_COLORS,
} from '../../utils/index.js'

export default function CommitsView() {
  const {
    API, currentBranch, setCurrentBranch,
    commitAnalysisCache, commitDetailCache, settings, currentRepo,
  } = useStore()
  const toast = useToast()

  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('All')
  const [expandedCommits, setExpanded] = useState(new Set())
  const [branches, setBranches]     = useState([])

  useEffect(() => {
    if (!API) return
    fetch(`${API}/branches?per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(useStore.getState().ghToken ? { Authorization: `Bearer ${useStore.getState().ghToken}` } : {}),
      },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setBranches)
      .catch(() => [])
  }, [API])

  const {
    data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch,
  } = useInfiniteQuery({
    queryKey: ['commits', API, currentBranch],
    queryFn: ({ pageParam = 1 }) => fetchCommitsPage(API, pageParam, currentBranch),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE_COMMITS ? allPages.length + 1 : undefined,
    enabled: !!API,
  })

  const commits = data?.pages.flat() ?? []

  useEffect(() => {
    function exportCSV() {
      const { commitAnalysisCache: cache, commitDetailCache: dCache } = useStore.getState()
      const rows = [['SHA', 'Message', 'Author', 'Date', 'Change Type', 'Quality', 'Risk Level', 'Files', 'Additions', 'Deletions']]
      commits.forEach(c => {
        const a = cache.get(c.sha)
        const d = dCache.get(c.sha)
        rows.push([
          c.sha.slice(0, 7),
          `"${(c.commit.message.split('\n')[0] || '').replace(/"/g, '""')}"`,
          c.commit.author.name,
          c.commit.author.date,
          a?.change_type || detectType(c.commit.message),
          `"${(a?.quality || '').replace(/"/g, '""')}"`,
          a?.risk_level || '',
          d?.files?.length || '',
          d?.stats?.additions || '',
          d?.stats?.deletions || '',
        ])
      })
      if (!commits.length) { toast('⚠️', 'No data', 'Load commits first'); return }
      const csv = rows.map(r => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `commit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast('⬇️', 'Export ready', `${commits.length} commits exported`)
    }
    window.addEventListener('gd:exportCSV', exportCSV)
    return () => window.removeEventListener('gd:exportCSV', exportCSV)
  }, [commits, toast])

  function getDisplayType(commit) {
    const cached = commitAnalysisCache.get(commit.sha)
    return cached ? cached.change_type : detectType(commit.commit.message)
  }

  const filtered = commits.filter(c => {
    const q = search.toLowerCase()
    if (q && !c.commit.author.name.toLowerCase().includes(q) && !c.sha.toLowerCase().includes(q)) return false
    if (filter !== 'All' && getDisplayType(c) !== filter) return false
    return true
  })

  // Stats
  const uniqueAuthors = new Set(commits.map(c => c.commit.author.name)).size
  const analyzedList  = [...commitAnalysisCache.values()]
  const highRisk      = analyzedList.filter(a => a?.risk_level?.startsWith('High')).length
  const goodPct       = analyzedList.length > 0
    ? Math.round(analyzedList.filter(a => a?.quality?.startsWith('Good')).length / analyzedList.length * 100)
    : null

  // Right panel data
  const typeCounts = useMemo(() => {
    const counts = {}
    commits.forEach(c => { const t = getDisplayType(c); counts[t] = (counts[t] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [commits.length, commitAnalysisCache.size])

  const maxTypeCount = typeCounts[0]?.[1] || 1

  // Risk donut data from cache
  const riskCounts = useMemo(() => {
    const r = { High: 0, Medium: 0, Low: 0 }
    analyzedList.forEach(a => {
      if (a?.risk_level?.startsWith('High')) r.High++
      else if (a?.risk_level?.startsWith('Medium')) r.Medium++
      else if (a?.risk_level) r.Low++
    })
    return r
  }, [commitAnalysisCache.size])

  // Heatmap: proper calendar grid, Monday-first, teal color, actual dates
  const heatmapData = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const monthStart = new Date(year, month, 1)
    const startOffset = (monthStart.getDay() + 6) % 7 // Monday=0
    const monthShort = now.toLocaleDateString('en-GB', { month: 'short' })
    const dayCounts = {}
    commits.forEach(c => {
      const d = new Date(c.commit.author.date)
      if (d.getMonth() === month && d.getFullYear() === year) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        dayCounts[key] = (dayCounts[key] || 0) + 1
      }
    })
    const maxC = Math.max(1, ...Object.values(dayCounts))
    const cells = []
    for (let i = 0; i < startOffset; i++) cells.push({ empty: true })
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const n = dayCounts[key] || 0
      const intensity = n === 0 ? 0 : Math.min(1, 0.2 + n / maxC * 0.8)
      cells.push({ empty: false, day: d, count: n, intensity, monthShort })
    }
    return cells
  }, [commits.length])

  // Top contributors
  const contributors = useMemo(() => {
    const map = {}
    commits.forEach(c => {
      const name = c.commit.author.name
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [commits.length])

  const maxContrib = contributors[0]?.[1] || 1

  // Group by date
  const groups = {}
  filtered.forEach(c => {
    const k = dayKey(c.commit.author.date)
    if (!groups[k]) groups[k] = []
    groups[k].push(c)
  })

  async function toggleCommit(sha) {
    const next = new Set(expandedCommits)
    if (next.has(sha)) { next.delete(sha); setExpanded(next); return }
    next.add(sha)
    setExpanded(new Set(next))
    if (settings.autoAnalyze && !commitAnalysisCache.has(sha)) {
      try {
        await fetchCommitDetail(API, sha)
        setExpanded(new Set(next))
        await analyzeCommit(API, sha)
        setExpanded(new Set(next))
      } catch (e) {
        if (e.message === 'no-key') {
          useStore.getState().switchView('settings')
          toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings to enable AI analysis')
        } else {
          toast('❌', 'Analysis failed', e.message || 'Unknown error')
        }
        setExpanded(new Set(next))
      }
    }
  }

  function copySHA(sha) {
    navigator.clipboard.writeText(sha).then(() => toast('✅', 'Copied', sha))
  }

  function bookmark(sha) {
    const bms = JSON.parse(sessionStorage.getItem('gcrmcp_bm') || '[]')
    if (!bms.includes(sha)) bms.push(sha)
    sessionStorage.setItem('gcrmcp_bm', JSON.stringify(bms))
    toast('🔖', 'Bookmarked', sha.slice(0, 7) + ' saved this session')
  }

  const TYPES = ['All', 'Feature', 'Bug Fix', 'Refactor', 'Chore', 'Docs', 'Tests', 'Performance', 'Security']
  const monthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div className="view active" id="view-commits">
      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Commits</div>
          <div className="stat-value">{commits.length || '—'}</div>
          <div className="stat-sub">last {commits.length} fetched</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Contributors</div>
          <div className="stat-value">{uniqueAuthors || '—'}</div>
          <div className="stat-sub">unique authors</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High Risk</div>
          <div className="stat-value">{highRisk > 0 ? highRisk : '—'}</div>
          <div className="stat-sub">from AI analysis</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Quality</div>
          <div className="stat-value">{goodPct !== null ? goodPct + '%' : '—'}</div>
          <div className="stat-sub">% Good commits</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="two-col">
        {/* Left: list */}
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                id="commit-search"
                type="text"
                placeholder="Search by author or SHA…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {branches.length > 0 && (
              <select
                id="branch-select"
                value={currentBranch}
                onChange={e => setCurrentBranch(e.target.value)}
                style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, outline: 'none', cursor: 'pointer', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                <option value="">{currentRepo?.default_branch || 'main'}</option>
                {branches.filter(b => b.name !== (currentRepo?.default_branch || 'main')).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            )}
          </div>

          <div className="filter-tabs" id="commit-filters">
            {TYPES.map(t => (
              <button key={t} className={`ftab${filter === t ? ' active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
            ))}
          </div>

          {isFetching && !isFetchingNextPage && commits.length === 0 ? (
            <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }}></div>)}</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><h3>No commits match</h3><p>Try a different search or filter.</p></div>
          ) : (
            <div id="commit-list">
              {Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(k => (
                <div key={k}>
                  <div className="date-div">{fmtDate(groups[k][0].commit.author.date)}</div>
                  {groups[k].map(c => (
                    <CommitCard
                      key={c.sha}
                      commit={c}
                      isExpanded={expandedCommits.has(c.sha)}
                      analysis={commitAnalysisCache.get(c.sha)}
                      detail={commitDetailCache.get(c.sha)}
                      displayType={getDisplayType(c)}
                      settings={settings}
                      commits={commits}
                      currentRepo={useStore.getState().currentRepo}
                      onToggle={toggleCommit}
                      onCopySHA={copySHA}
                      onBookmark={bookmark}
                      onAuthorClick={name => setSearch(name)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {hasNextPage && (
            <div id="load-more-commits">
              <button
                className="btn"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                style={{ width: '100%', justifyContent: 'center', margin: '12px 0' }}
              >
                {isFetchingNextPage ? 'Loading…' : `Load more commits (${commits.length} loaded)`}
              </button>
            </div>
          )}
        </div>

        {/* Right: panels */}
        <div>
          <div className="panel">
            <div className="panel-title">
              Commit Types
              <a href="#" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('gd:exportCSV')) }}>Export</a>
            </div>
            {typeCounts.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Expand commits to generate analysis</div>
              : typeCounts.map(([type, count]) => (
                <div key={type} className="bar-row">
                  <div className="bar-label">{type}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(count / maxTypeCount) * 100}%`, background: TYPE_COLORS[type] || 'var(--gold)' }}></div>
                  </div>
                  <div className="bar-cnt">{count}</div>
                </div>
              ))
            }
          </div>

          <div className="panel">
            <div className="panel-title">Risk Distribution</div>
            {analyzedList.length === 0 ? (
              <div className="donut-wrap"><div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>Expand commits<br />to generate analysis</div></div>
            ) : (
              <RiskDonut counts={riskCounts} total={analyzedList.length} />
            )}
          </div>

          <div className="panel">
            <div className="panel-title">Activity — <span>{monthName}</span></div>
            <div className="heatmap-labels" id="hm-labels">
              {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} className="hm-lbl">{d}</div>)}
            </div>
            <div className="heatmap-grid" id="heatmap">
              {heatmapData.map((cell, i) => {
                if (cell.empty) return <div key={i} className="hm-cell" style={{ opacity: 0 }}></div>
                return (
                  <div
                    key={i}
                    className="hm-cell"
                    data-tip={`${cell.count} commit${cell.count !== 1 ? 's' : ''} on ${cell.day} ${cell.monthShort}`}
                    style={{ background: cell.count === 0 ? undefined : `rgba(45,212,191,${cell.intensity.toFixed(2)})` }}
                  ></div>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              Top Contributors
              <a href="#" onClick={e => { e.preventDefault(); useStore.getState().switchView('insights') }}>See all</a>
            </div>
            <div id="top-contribs">
              {contributors.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>No commits loaded yet</div>
                : contributors.map(([name, count]) => (
                  <div key={name} className="contrib-row" onClick={() => setSearch(name)} title={`Filter by ${name}`}>
                    <div className="av" style={{ background: avatarColor(name), width: 24, height: 24, fontSize: 10, flexShrink: 0 }}>{avatarInitial(name)}</div>
                    <div className="cname">{name}</div>
                    <div className="ccnt">{count}</div>
                    <div className="cbar"><div className="cbar-fill" style={{ width: `${(count / maxContrib) * 100}%` }}></div></div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RiskDonut({ counts, total }) {
  const colors = { High: 'var(--red)', Medium: 'var(--amber)', Low: 'var(--teal)' }
  const r = 54, cx = 64, cy = 64, circumference = 2 * Math.PI * r
  let offset = 0
  const slices = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, val]) => {
      const pct = val / total
      const dashLen = pct * circumference
      const slice = { key, val, pct, dashLen, offset, color: colors[key] }
      offset += dashLen
      return slice
    })
  return (
    <div className="donut-wrap">
      <svg width="128" height="128" viewBox="0 0 128 128">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--s3)" strokeWidth="14" />
        {slices.map(s => (
          <circle key={s.key} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="14"
            strokeDasharray={`${s.dashLen} ${circumference - s.dashLen}`}
            strokeDashoffset={-s.offset + circumference * 0.25}
            style={{ transition: 'stroke-dasharray .6s ease' }} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="donut-center">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="donut-center-sub">analysed</text>
      </svg>
      <div className="donut-legend">
        {Object.entries(counts).filter(([, v]) => v > 0).map(([key, val]) => (
          <div key={key} className="leg-item">
            <div className="leg-dot" style={{ background: colors[key] }}></div>
            {key} ({val})
          </div>
        ))}
      </div>
    </div>
  )
}

function CommitCard({ commit: c, isExpanded, analysis, detail, displayType, settings, commits, currentRepo, onToggle, onCopySHA, onBookmark, onAuthorClick }) {
  const sha   = c.sha
  const msg   = c.commit.message.split('\n')[0]
  const auth  = c.commit.author.name
  const date  = c.commit.author.date
  const risk  = analysis ? riskCls(analysis.risk_level) : ''
  const qdot  = analysis
    ? (analysis.quality?.startsWith('Good') ? 'good' : 'needs')
    : (isExpanded ? 'spin-dot' : '')
  const qdotTitle = analysis
    ? `Quality: ${analysis.quality?.split(':')[0]?.trim() || ''}`
    : (isExpanded ? 'Analysing…' : undefined)
  const secWarn = settings.securityScan && detail && hasSecurityTouch(detail.files || [])

  return (
    <div className={`commit-card ${risk} ${isExpanded ? 'expanded' : ''}`} id={`cc-${sha}`}>
      <div className="commit-header" onClick={() => onToggle(sha)}>
        <div className="commit-msg">{msg}</div>
        <div className="commit-meta">
          {secWarn && <span style={{ color: 'var(--red)', fontSize: 12 }} title="Touches security files">🔒</span>}
          <span className={`tbadge ${typeCls(displayType)}`}>{displayType}</span>
          <span className="sha-pill">{sha.slice(0, 7)}</span>
          <div className="av" style={{ background: avatarColor(auth) }}>{avatarInitial(auth)}</div>
          <span className="author-n" onClick={e => { e.stopPropagation(); onAuthorClick(auth) }}>{auth}</span>
          <span className="tago">{timeAgo(date)}</span>
          <div className={`qdot ${qdot}`} data-tip={qdotTitle || undefined}></div>
        </div>
      </div>
      {isExpanded && (
        <ExpandedCommit
          sha={sha}
          analysis={analysis}
          detail={detail}
          commits={commits}
          currentRepo={currentRepo}
          settings={settings}
          onCopySHA={onCopySHA}
          onBookmark={onBookmark}
        />
      )}
    </div>
  )
}

function CommitThinking() {
  const msgs = ['Fetching commit details…', 'Reading the diff…', 'Analysing with Claude…', 'Generating insights…']
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setIdx(i => (i + 1) % msgs.length), 1800)
    return () => clearInterval(iv)
  }, [])
  return (
    <div className="ai-thinking">
      <div className="ai-thinking-msg">{msgs[idx]}</div>
      <div className="ai-dots">
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
      </div>
    </div>
  )
}

function ExpandedCommit({ sha, analysis, detail, commits, currentRepo, settings, onCopySHA, onBookmark }) {
  const files = detail?.files || []

  if (!analysis) {
    return (
      <div className="commit-body">
        <CommitThinking />
      </div>
    )
  }

  const origMsg  = commits.find(c => c.sha === sha)?.commit.message.split('\n')[0] || ''
  const showSugg = settings.showSuggested && analysis.suggested_message && analysis.suggested_message !== origMsg

  return (
    <div className="commit-body">
      <div className="ag">
        <div className="abox abox-plain">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'var(--gold-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" width="11" height="11"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div className="albl">Plain English</div>
          </div>
          <div className="acontent" dangerouslySetInnerHTML={{ __html: renderPlainSummary(analysis.plain_summary) }}></div>
        </div>

        <div className="abox abox-tech">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'rgba(96,165,250,.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" width="11" height="11"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </div>
            <div className="albl">Technical Summary</div>
          </div>
          <div className="acontent" dangerouslySetInnerHTML={{ __html: renderTechImpact(analysis.technical_summary) }}></div>
        </div>

        {showSugg && (
          <div className="abox fw" style={{ borderLeft: '3px solid var(--gold)' }}>
            <div className="abox-hdr">
              <div className="abox-icon" style={{ background: 'var(--gold-dim)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" width="11" height="11"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
              <div className="albl">Suggested Message</div>
            </div>
            <div className="sugg-msg">{analysis.suggested_message}</div>
            <div className="orig-msg">Original: {origMsg}</div>
          </div>
        )}

        <div className="abox fw">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="abox-hdr">
                <div className="abox-icon" style={{ background: 'var(--red-dim)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" width="11" height="11"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                </div>
                <div className="albl">Risk Level</div>
              </div>
              <div dangerouslySetInnerHTML={{ __html: renderRiskBadge(analysis.risk_level) }}></div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="abox-hdr">
                <div className="abox-icon" style={{ background: 'rgba(74,222,128,.1)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div className="albl">Quality</div>
              </div>
              <div dangerouslySetInnerHTML={{ __html: renderQualityBadge(analysis.quality) }}></div>
            </div>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="chips">
          <span className="chip">{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
          <span className="chip add">+{files.reduce((s, f) => s + f.additions, 0)}</span>
          <span className="chip del">-{files.reduce((s, f) => s + f.deletions, 0)}</span>
        </div>
      )}

      <div className="act-row">
        <button className="abtn" onClick={() => onCopySHA(sha)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy SHA
        </button>
        <a className="abtn" href={`https://github.com/${currentRepo?.full_name || ''}/commit/${sha}`} target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View Diff
        </a>
        <button className="abtn" onClick={() => onBookmark(sha)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          Bookmark
        </button>
      </div>
    </div>
  )
}
