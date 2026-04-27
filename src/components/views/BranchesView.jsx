import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchBranches } from '../../api/github.js'
import { analyzeStaleItems } from '../../api/anthropic.js'
import { timeAgo } from '../../utils/index.js'

const THINKING_MSGS = ['Scanning branches…', 'Checking PR activity…', 'Identifying stale items…', 'Generating recommendations…']

function ThinkingDots({ msgs }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setIdx(i => (i + 1) % msgs.length), 1800)
    return () => clearInterval(iv)
  }, [msgs.length])
  return (
    <div className="ai-thinking" style={{ padding: '24px 16px' }}>
      <div className="ai-thinking-msg">{msgs[idx]}</div>
      <div className="ai-dots">
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
      </div>
    </div>
  )
}

function SevBadge({ sev }) {
  const s = sev || 'low'
  return <span className={`stale-sev sev-${s}`}>{s}</span>
}

function StalePanel({ result, onClose }) {
  const r = result
  const hasContent = r.stale_branches?.length || r.long_prs?.length || r.activity_insights?.length || r.recommendations?.length

  return (
    <div id="stale-panel" style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden', marginBottom: 16 }}>
      <div className="stale-panel-hdr">
        <span className="stale-panel-title">AI Branch &amp; Activity Analysis</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>
      <div id="stale-panel-body">
        {!hasContent ? (
          <div className="stale-section">
            <div style={{ fontSize: 12, color: 'var(--teal)', textAlign: 'center', padding: 8 }}>
              No significant issues found. Repository looks healthy!
            </div>
          </div>
        ) : (
          <>
            {r.stale_branches?.length > 0 && (
              <div className="stale-section">
                <div className="stale-section-lbl">Stale Branches ({r.stale_branches.length})</div>
                {r.stale_branches.map((b, i) => (
                  <div key={i} className="stale-item">
                    <span className="stale-item-icon">⎇</span>
                    <div className="stale-item-text">
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{b.name}</span>
                      <br />
                      <span style={{ color: 'var(--text3)' }}>{b.concern}</span>
                    </div>
                    <SevBadge sev={b.severity} />
                  </div>
                ))}
              </div>
            )}
            {r.long_prs?.length > 0 && (
              <div className="stale-section">
                <div className="stale-section-lbl">Long-running PRs ({r.long_prs.length})</div>
                {r.long_prs.map((p, i) => (
                  <div key={i} className="stale-item">
                    <span className="stale-item-icon" style={{ color: 'var(--gold)' }}>⟵</span>
                    <div className="stale-item-text">
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)' }}>#{p.number}</span>{' '}{p.title || ''}
                      <br />
                      <span style={{ color: 'var(--text3)' }}>{p.concern}</span>
                    </div>
                    <SevBadge sev={p.severity} />
                  </div>
                ))}
              </div>
            )}
            {r.activity_insights?.length > 0 && (
              <div className="stale-section">
                <div className="stale-section-lbl">Activity Insights</div>
                {r.activity_insights.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--teal)', flexShrink: 0 }}>◆</span>{s}
                  </div>
                ))}
              </div>
            )}
            {r.recommendations?.length > 0 && (
              <div className="stale-section">
                <div className="stale-section-lbl">Recommendations</div>
                {r.recommendations.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text2)', padding: 8, background: 'var(--s2)', borderRadius: 6, marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--gold)', flexShrink: 0 }}>{i + 1}.</span>{s}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function BranchesView() {
  const { API, currentRepo } = useStore()
  const toast = useToast()
  const [staleResult, setStaleResult]   = useState(null)
  const [staleLoading, setStaleLoading] = useState(false)
  const [showStale, setShowStale]       = useState(false)
  const [thinkingMsg, setThinkingMsg]   = useState('')
  const [compareData, setCompareData]   = useState({})
  const [prs, setPrs]                   = useState([])

  const { data: branches = [], isLoading, refetch } = useQuery({
    queryKey: ['branches', API],
    queryFn: () => fetchBranches(API),
    enabled: !!API,
  })

  const defaultBranch = currentRepo?.default_branch || 'main'
  const ghToken = useStore.getState().ghToken

  // Fetch ahead/behind for each non-default branch
  useEffect(() => {
    if (!branches.length || !API) return
    const toCompare = branches.filter(b => b.name !== defaultBranch).slice(0, 20)
    if (!toCompare.length) return
    Promise.all(
      toCompare.map(b =>
        fetch(`${API}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(b.name)}`, {
          headers: {
            Accept: 'application/vnd.github+json',
            ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
          },
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    ).then(results => {
      const map = {}
      toCompare.forEach((b, i) => {
        if (results[i]) map[b.name] = { ahead: results[i].ahead_by || 0, behind: results[i].behind_by || 0 }
      })
      setCompareData(map)
    })
  }, [branches.length, API, defaultBranch])

  // Fetch open PRs for PR badge
  useEffect(() => {
    if (!API) return
    fetch(`${API}/pulls?state=all&per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      },
    }).then(r => r.ok ? r.json() : []).then(setPrs).catch(() => [])
  }, [API])

  const prByHead = {}
  prs.forEach(pr => { prByHead[pr.head.ref] = pr })

  const branchData = branches.map(b => {
    const isDefault = b.name === defaultBranch
    const cmp       = compareData[b.name]
    const ageDays   = b.commit?.commit?.author?.date
      ? Math.floor((Date.now() - new Date(b.commit.commit.author.date)) / 86400000)
      : null
    return {
      name: b.name, isDefault,
      ahead:  cmp?.ahead  ?? 0,
      behind: cmp?.behind ?? 0,
      lastDate: b.commit?.commit?.author?.date || null,
      ageDays,
      sha: b.commit?.sha?.slice(0, 7) || '',
      pr: prByHead[b.name] || null,
    }
  })

  async function handleAnalyzeStale() {
    if (staleResult && !staleLoading) { setShowStale(s => !s); return }
    setStaleLoading(true)
    setShowStale(true)
    try {
      // Get all commits from store for type breakdown
      const storageCommits = useStore.getState().commitAnalysisCache
      const commits = [...storageCommits.entries()].map(([sha, a]) => ({
        sha, commit: { message: a.change_type || '' },
      }))

      const result = await analyzeStaleItems(
        branchData,
        prs,
        commits,
        defaultBranch,
        currentRepo?.full_name || ''
      )
      setStaleResult(result)
    } catch (e) {
      if (e.message === 'no-key') {
        useStore.getState().switchView('settings')
        toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
      } else {
        toast('❌', 'Analysis failed', e.message)
      }
      setShowStale(false)
    } finally {
      setStaleLoading(false)
    }
  }

  return (
    <div className="view active" id="view-branches">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }} id="branch-meta">
          {branches.length} branch{branches.length !== 1 ? 'es' : ''}{defaultBranch ? ` · default: ${defaultBranch}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            id="stale-btn"
            onClick={handleAnalyzeStale}
            disabled={staleLoading}
            style={{ fontSize: 12, color: 'var(--gold)', borderColor: 'rgba(201,168,76,.3)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            {staleLoading ? 'Analysing…' : 'AI Analysis'}
          </button>
          <button className="btn" onClick={() => refetch()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stale analysis panel */}
      {showStale && (
        staleLoading
          ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden', marginBottom: 16 }}>
              <div className="stale-panel-hdr">
                <span className="stale-panel-title">AI Branch &amp; Activity Analysis</span>
                <button onClick={() => setShowStale(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1 }}>✕</button>
              </div>
              <ThinkingDots msgs={THINKING_MSGS} />
            </div>
          )
          : staleResult && (
            <StalePanel result={staleResult} onClose={() => setShowStale(false)} />
          )
      )}

      {/* Branch list */}
      {isLoading ? (
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }}></div>)}</div>
      ) : branches.length === 0 ? (
        <div className="empty-state"><h3>No branches</h3><p>Could not load branch data.</p></div>
      ) : (
        <div id="branch-list">
          {branchData.map(b => {
            const stale = !b.isDefault && b.ageDays !== null && b.ageDays > 60
            return (
              <div key={b.name} className="branch-card">
                <div>
                  <div className="branch-name">
                    {b.name}
                    {b.isDefault && <span className="branch-default-badge" style={{ marginLeft: 8 }}>default</span>}
                    {b.pr && <span className="branch-pr-badge" style={{ marginLeft: 6 }}>PR #{b.pr.number}</span>}
                    {stale && <span className="branch-stale" style={{ marginLeft: 6 }}>stale</span>}
                  </div>
                  <div className="branch-meta-row" style={{ marginTop: 5 }}>
                    {!b.isDefault && b.ahead > 0 && <span className="branch-ahead">+{b.ahead} ahead</span>}
                    {!b.isDefault && b.behind > 0 && <span className="branch-behind">{b.behind} behind</span>}
                    {b.lastDate && <span className="branch-stat">Last commit {timeAgo(b.lastDate)}</span>}
                    {b.sha && <span className="branch-stat" style={{ fontFamily: 'var(--mono)' }}>{b.sha}</span>}
                    {b.ageDays !== null && !b.isDefault && <span className="branch-stat">{b.ageDays}d old</span>}
                  </div>
                </div>
                <div className="branch-actions">
                  {b.pr && (
                    <button className="abtn" style={{ fontSize: 11 }} onClick={() => useStore.getState().switchView('prs')}>View PR</button>
                  )}
                  {!b.isDefault && !b.pr && (
                    <button className="abtn" style={{ fontSize: 11 }} onClick={() => useStore.getState().switchView('prs')}>Open PR</button>
                  )}
                  <a
                    className="abtn"
                    style={{ fontSize: 11 }}
                    href={`https://github.com/${currentRepo?.full_name || ''}/tree/${encodeURIComponent(b.name)}`}
                    target="_blank"
                    rel="noopener"
                  >View</a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
