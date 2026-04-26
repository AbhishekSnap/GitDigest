import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchBranches } from '../../api/github.js'
import { analyzeStaleItems } from '../../api/anthropic.js'
import { timeAgo } from '../../utils/index.js'

export default function BranchesView() {
  const { API, currentRepo } = useStore()
  const toast = useToast()
  const [staleResult, setStaleResult] = useState(null)
  const [staleLoading, setStaleLoading] = useState(false)
  const [showStale, setShowStale] = useState(false)
  const [compareData, setCompareData] = useState({})
  const [prs, setPrs] = useState([])

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
        })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      const map = {}
      toCompare.forEach((b, i) => {
        if (results[i]) {
          map[b.name] = { ahead: results[i].ahead_by || 0, behind: results[i].behind_by || 0 }
        }
      })
      setCompareData(map)
    })
  }, [branches.length, API, defaultBranch])

  // Fetch open PRs to show PR badge on branch
  useEffect(() => {
    if (!API) return
    fetch(`${API}/pulls?state=open&per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
      },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setPrs)
      .catch(() => [])
  }, [API])

  const prByHead = {}
  prs.forEach(pr => { prByHead[pr.head.ref] = pr })

  async function handleAnalyzeStale() {
    if (staleResult) { setShowStale(s => !s); return }
    setStaleLoading(true)
    try {
      const result = await analyzeStaleItems(branches, currentRepo?.full_name || '')
      setStaleResult(result)
      setShowStale(true)
    } catch (e) {
      if (e.message === 'no-key') {
        useStore.getState().switchView('settings')
        toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
      } else {
        toast('❌', 'Analysis failed', e.message)
      }
    } finally { setStaleLoading(false) }
  }

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

  return (
    <div className="view active" id="view-branches">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }} id="branch-meta">
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
            {staleLoading ? 'Analyzing…' : 'AI Analysis'}
          </button>
          <button className="btn" onClick={() => refetch()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stale analysis panel */}
      {showStale && staleResult && (
        <div id="stale-panel" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-card)', overflow: 'hidden', marginBottom: 16 }}>
          <div className="stale-panel-hdr">
            <span className="stale-panel-title">AI Branch &amp; Activity Analysis</span>
            <button onClick={() => setShowStale(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>{staleResult.summary}</p>
            {staleResult.stale?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--text3)', marginBottom: 8 }}>Consider deleting</div>
                {staleResult.stale.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{b.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>— {b.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
                    {b.isDefault && <span className="branch-default-badge">default</span>}
                    {b.pr && <span className="branch-pr-badge">PR #{b.pr.number}</span>}
                    {stale && <span className="branch-stale">stale</span>}
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
                  >
                    View
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
