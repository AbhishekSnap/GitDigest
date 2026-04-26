import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchBranches } from '../../api/github.js'
import { analyzeStaleItems } from '../../api/anthropic.js'
import { timeAgo, avatarColor, avatarInitial } from '../../utils/index.js'

export default function BranchesView() {
  const { API, currentRepo } = useStore()
  const toast = useToast()
  const [staleResult, setStaleResult] = useState(null)
  const [staleLoading, setStaleLoading] = useState(false)
  const [showStale, setShowStale] = useState(false)

  const { data: branches = [], isLoading, refetch } = useQuery({
    queryKey: ['branches', API],
    queryFn: () => fetchBranches(API),
    enabled: !!API,
  })

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

  return (
    <div className="view active" id="view-branches">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }} id="branch-meta">
          {branches.length} branch{branches.length !== 1 ? 'es' : ''}
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
          <div id="stale-panel-body" style={{ padding: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>{staleResult.summary}</p>
            {staleResult.stale?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
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
        <div>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }}></div>)}
        </div>
      ) : branches.length === 0 ? (
        <div className="empty-state"><h3>No branches</h3><p>Could not load branch data.</p></div>
      ) : (
        <div id="branch-list">
          {branches.map(b => {
            const author  = b.commit?.commit?.author?.name || '?'
            const date    = b.commit?.commit?.author?.date
            const isDefault = b.name === currentRepo?.default_branch
            return (
              <div key={b.name} className="branch-card">
                <div className="branch-info">
                  <div className="branch-name">
                    <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" style={{ color: 'var(--text3)', flexShrink: 0 }}><path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/></svg>
                    {b.name}
                    {isDefault && <span className="branch-default">default</span>}
                  </div>
                  {b.commit?.sha && (
                    <div className="branch-commit">
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{b.commit.sha.slice(0, 7)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{b.commit.commit?.message?.split('\n')[0]?.slice(0, 60)}</span>
                    </div>
                  )}
                </div>
                <div className="branch-meta">
                  {author && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="av" style={{ width: 20, height: 20, fontSize: 9, flexShrink: 0, background: avatarColor(author) }}>{avatarInitial(author)}</div>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{author}</span>
                  </div>}
                  {date && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{timeAgo(date)}</span>}
                  <a
                    className="abtn"
                    href={`https://github.com/${currentRepo?.full_name}/tree/${b.name}`}
                    target="_blank"
                    rel="noopener"
                    style={{ fontSize: 11 }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
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
