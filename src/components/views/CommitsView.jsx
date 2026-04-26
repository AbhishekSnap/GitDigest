import { useState, useCallback, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchCommitsPage, fetchCommitDetail, PAGE_SIZE_COMMITS } from '../../api/github.js'
import { analyzeCommit } from '../../api/anthropic.js'
import {
  timeAgo, fmtDate, dayKey, avatarColor, avatarInitial,
  detectType, typeCls, riskCls, esc,
  hasSecurityTouch, renderPlainSummary, renderTechImpact,
  renderRiskBadge, renderQualityBadge, renderDiff, splitLabel,
} from '../../utils/index.js'

export default function CommitsView({ onStatsChange }) {
  const {
    API, currentBranch, setCurrentBranch,
    commitAnalysisCache, commitDetailCache, settings,
  } = useStore()
  const toast = useToast()

  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('All')
  const [expandedCommits, setExpanded] = useState(new Set())
  const [branches, setBranches]     = useState([])

  // Fetch branches for selector
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

  // Update parent stats
  useEffect(() => {
    if (onStatsChange) onStatsChange(commits, commitAnalysisCache)
  }, [commits.length, commitAnalysisCache.size])

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

  // Group by date
  const groups = {}
  filtered.forEach(c => {
    const k = dayKey(c.commit.author.date)
    if (!groups[k]) groups[k] = []
    groups[k].push(c)
  })

  async function toggleCommit(sha) {
    const next = new Set(expandedCommits)
    if (next.has(sha)) {
      next.delete(sha)
      setExpanded(next)
      return
    }
    next.add(sha)
    setExpanded(new Set(next))

    if (settings.autoAnalyze && !commitAnalysisCache.has(sha)) {
      try {
        await fetchCommitDetail(API, sha)
        setExpanded(new Set(next)) // trigger re-render for files
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

  return (
    <div className="view active" id="view-commits">
      {/* Commit controls */}
      <div className="commit-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div className="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="search-input"
              id="commit-search"
              type="text"
              placeholder="Search author or SHA…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {branches.length > 0 && (
            <select
              id="branch-select"
              className="ins-author-sel"
              value={currentBranch}
              onChange={e => setCurrentBranch(e.target.value)}
              style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
            >
              <option value="">Default branch</option>
              {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          )}
        </div>
        <div className="filter-tabs" id="commit-filters">
          {TYPES.map(t => (
            <button key={t} className={`ftab${filter === t ? ' active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Commit list */}
      {isFetching && !isFetchingNextPage && commits.length === 0 ? (
        <div>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }}></div>)}
        </div>
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
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div id="load-more-commits">
          <button
            id="load-more-commits-btn"
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
  )
}

function CommitCard({ commit: c, isExpanded, analysis, detail, displayType, settings, commits, currentRepo, onToggle, onCopySHA, onBookmark }) {
  const sha   = c.sha
  const msg   = c.commit.message.split('\n')[0]
  const auth  = c.commit.author.name
  const date  = c.commit.author.date
  const risk  = analysis ? riskCls(analysis.risk_level) : ''
  const qdot  = analysis
    ? (analysis.quality?.startsWith('Good') ? 'good' : 'needs')
    : (isExpanded ? 'spin-dot' : '')
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
          <span className="author-n">{auth}</span>
          <span className="tago">{timeAgo(date)}</span>
          <div className={`qdot ${qdot}`}></div>
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

function ExpandedCommit({ sha, analysis, detail, commits, currentRepo, settings, onCopySHA, onBookmark }) {
  const files = detail?.files || []

  if (!analysis && !detail) {
    return (
      <div className="commit-body">
        <div className="ag">
          <div className="skeleton" style={{ height: 100 }}></div>
          <div className="skeleton" style={{ height: 100 }}></div>
        </div>
      </div>
    )
  }
  if (!analysis) return null

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
