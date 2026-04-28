import { useState, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchPRsPage, fetchPRFiles, fetchPRReviews, fetchPRComments, fetchPRReviewComments, ghWrite, PAGE_SIZE_PRS } from '../../api/github.js'
import { analyzePR, reviewPRDiff, scorePRRisk } from '../../api/anthropic.js'
import {
  timeAgo, avatarColor, avatarInitial, esc, splitLabel,
  renderPlainSummary, renderTechImpact, renderQualityBadge, renderDiff,
} from '../../utils/index.js'

export default function PRsView() {
  const { API, prAnalysisCache, prFilesCache, prReviewsCache, prCommentsCache, prReviewCommentsCache, prReviewAICache, prRiskCache, currentRepo } = useStore()
  const toast = useToast()

  const [filter, setFilter]       = useState('All')
  const [expandedPRs, setExpanded] = useState(new Set())

  const {
    data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch,
  } = useInfiniteQuery({
    queryKey: ['prs', API],
    queryFn: ({ pageParam = 1 }) => fetchPRsPage(API, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE_PRS ? allPages.length + 1 : undefined,
    enabled: !!API,
  })

  const prs = data?.pages.flat() ?? []

  const filtered = prs.filter(p => {
    if (filter === 'Open'   && p.state !== 'open') return false
    if (filter === 'Merged' && !p.merged_at)       return false
    if (filter === 'Closed' && (p.state !== 'closed' || p.merged_at)) return false
    return true
  })

  // Stats
  const open   = prs.filter(p => p.state === 'open').length
  const merged = prs.filter(p => !!p.merged_at).length
  const ttms   = prs.filter(p => p.merged_at).map(p => (new Date(p.merged_at) - new Date(p.created_at)) / 3600000)
  const avgTTM = ttms.length ? Math.round(ttms.reduce((a, b) => a + b, 0) / ttms.length) : null

  async function togglePR(num) {
    const pr = prs.find(p => p.number === num)
    if (!pr) return

    const next = new Set(expandedPRs)
    if (next.has(num)) { next.delete(num); setExpanded(next); return }

    next.add(num)
    setExpanded(new Set(next))

    if (!prAnalysisCache.has(num)) {
      try {
        await Promise.all([
          fetchPRFiles(API, num),
          fetchPRReviews(API, num),
          fetchPRComments(API, num),
          fetchPRReviewComments(API, num),
        ])
        setExpanded(new Set(next))
        await analyzePR(API, num, pr)
        setExpanded(new Set(next))
      } catch (e) {
        if (e.message === 'no-key') {
          useStore.getState().switchView('settings')
          toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
        } else {
          toast('❌', 'PR Analysis failed', e.message || 'Unknown error')
        }
        setExpanded(new Set(next))
      }
    }
  }

  async function handleMergePR(num) {
    if (!confirm(`Merge PR #${num}? This cannot be undone.`)) return
    try {
      await ghWrite('PUT', `${API}/pulls/${num}/merge`, { merge_method: 'squash' })
      toast('✅', 'PR Merged', `#${num} merged successfully`)
      refetch()
    } catch (e) { toast('❌', 'Merge failed', e.message) }
  }

  async function handleClosePR(num) {
    if (!confirm(`Close PR #${num} without merging?`)) return
    try {
      await ghWrite('PATCH', `${API}/pulls/${num}`, { state: 'closed' })
      toast('✅', 'PR Closed', `#${num} closed`)
      refetch()
    } catch (e) { toast('❌', 'Close failed', e.message) }
  }

  function copyPRLink(num) {
    navigator.clipboard.writeText(`https://github.com/${currentRepo?.full_name || ''}/pull/${num}`)
      .then(() => toast('✅', 'Copied', 'PR link copied'))
  }

  return (
    <div className="view active" id="view-prs">
      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Open</div><div className="stat-value" id="pr-open">{open}</div></div>
        <div className="stat-card"><div className="stat-label">Merged</div><div className="stat-value" id="pr-merged">{merged}</div></div>
        <div className="stat-card"><div className="stat-label">Avg TTM</div><div className="stat-value" id="pr-ttm">{avgTTM != null ? avgTTM + 'h' : '—'}</div></div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="filter-tabs" id="pr-filters">
          {['All', 'Open', 'Merged', 'Closed'].map(f => (
            <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => useStore.getState().switchView('settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New PR
        </button>
      </div>

      {/* PR list */}
      {isFetching && !isFetchingNextPage && prs.length === 0 ? (
        <div>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 8 }}></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h3>No pull requests</h3><p>Try a different filter.</p></div>
      ) : (
        <div id="pr-list">
          {filtered.map(p => (
            <PRCard
              key={p.number}
              pr={p}
              isExpanded={expandedPRs.has(p.number)}
              analysis={prAnalysisCache.get(p.number)}
              files={prFilesCache.get(p.number) || []}
              reviews={prReviewsCache.get(p.number) || []}
              comments={prCommentsCache.get(p.number) || []}
              reviewComments={prReviewCommentsCache.get(p.number) || []}
              aiReview={prReviewAICache.get(p.number)}
              riskData={prRiskCache.get(p.number)}
              currentRepo={currentRepo}
              API={API}
              onToggle={togglePR}
              onMerge={handleMergePR}
              onClose={handleClosePR}
              onCopyLink={copyPRLink}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div id="load-more-prs">
          <button
            id="load-more-prs-btn"
            className="btn"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            style={{ width: '100%', justifyContent: 'center', margin: '12px 0' }}
          >
            {isFetchingNextPage ? 'Loading…' : `Load more PRs (${prs.length} loaded)`}
          </button>
        </div>
      )}
    </div>
  )
}

function PRStatusBadge({ p }) {
  if (p.merged_at) return <span className="sbadge s-merged">Merged</span>
  if (p.state === 'open') return <span className="sbadge s-open">Open</span>
  return <span className="sbadge s-closed">Closed</span>
}

function PRCard({ pr: p, isExpanded, analysis, files, reviews, comments, reviewComments, aiReview, riskData, currentRepo, API, onToggle, onMerge, onClose, onCopyLink }) {
  return (
    <div className={`pr-card ${isExpanded ? 'expanded' : ''}`} id={`prc-${p.number}`}>
      <div className="pr-header" onClick={() => onToggle(p.number)}>
        <span className="pr-num">#{p.number}</span>
        <span className="pr-title">{p.title}</span>
        <div className="pr-meta">
          <div className="av" style={{ background: avatarColor(p.user.login) }}>{avatarInitial(p.user.login)}</div>
          <span className="author-n">{p.user.login}</span>
          <span className="branch-lbl" style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {p.base.ref}</span>
          <PRStatusBadge p={p} />
          <span className="tago">{timeAgo(p.created_at)}</span>
        </div>
      </div>
      {isExpanded && (
        <ExpandedPR
          pr={p}
          analysis={analysis}
          files={files}
          reviews={reviews}
          comments={comments}
          reviewComments={reviewComments}
          aiReview={aiReview}
          riskData={riskData}
          currentRepo={currentRepo}
          API={API}
          onMerge={onMerge}
          onClose={onClose}
          onCopyLink={onCopyLink}
        />
      )}
    </div>
  )
}

function ThinkingDots({ messages }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setIdx(i => (i + 1) % messages.length), 1800)
    return () => clearInterval(iv)
  }, [messages.length])
  return (
    <div className="ai-thinking" style={{ marginBottom: 10 }}>
      <div className="ai-thinking-msg">{messages[idx]}</div>
      <div className="ai-dots">
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
        <div className="ai-dot"></div>
      </div>
    </div>
  )
}

function ExpandedPR({ pr: p, analysis, files, reviews, comments, reviewComments, aiReview, riskData, currentRepo, API, onMerge, onClose, onCopyLink }) {
  const toast = useToast()
  const [showDiff, setShowDiff]         = useState(false)
  const [showAIReview, setShowAIReview] = useState(false)
  const [showRisk, setShowRisk]         = useState(false)
  const [reviewBody, setReviewBody]     = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [aiReviewLoading, setAIReviewLoading] = useState(false)
  const [riskLoading, setRiskLoading]   = useState(false)

  const num = p.number

  if (!analysis) {
    return (
      <div className="pr-body">
        {files.length === 0 ? (
          <div className="ag">
            <div className="skeleton" style={{ height: 90 }}></div>
            <div className="skeleton" style={{ height: 90 }}></div>
          </div>
        ) : (
          <ThinkingDots messages={['Reading PR files…', 'Analysing with Claude…', 'Reviewing sentiment…', 'Generating insights…']} />
        )}
      </div>
    )
  }

  const sentiment = analysis.review_sentiment || ''
  let revCls = 'rev-none'
  if (sentiment.startsWith('Approved'))       revCls = 'rev-approved'
  else if (sentiment.startsWith('Changes'))   revCls = 'rev-changes'
  else if (sentiment.startsWith('Mixed'))     revCls = 'rev-mixed'

  async function handleAIReview() {
    if (aiReview) { setShowAIReview(s => !s); return }
    setAIReviewLoading(true)
    setShowAIReview(true)
    try {
      await reviewPRDiff(API, num)
    } catch (e) {
      toast('❌', 'AI Review failed', e.message)
      setShowAIReview(false)
    } finally { setAIReviewLoading(false) }
  }

  async function handleRiskScore() {
    if (riskData) { setShowRisk(s => !s); return }
    setRiskLoading(true)
    setShowRisk(true)
    try {
      await scorePRRisk(API, num)
    } catch (e) {
      toast('❌', 'Risk scoring failed', e.message)
      setShowRisk(false)
    } finally { setRiskLoading(false) }
  }

  async function submitReview(event) {
    setReviewStatus('Submitting…')
    try {
      await ghWrite('POST', `${API}/pulls/${num}/reviews`, { body: reviewBody, event })
      const label = event === 'APPROVE' ? 'Approved' : event === 'REQUEST_CHANGES' ? 'Changes Requested' : 'Comment posted'
      toast('✅', 'Review submitted', label + ` on PR #${num}`)
      setReviewStatus('')
      setReviewBody('')
      useStore.getState().setPRReviews(num, null)
    } catch (e) { setReviewStatus('Failed: ' + e.message) }
  }

  const allComments = [
    ...comments.map(c => ({ ...c, _type: 'comment' })),
    ...reviewComments.map(c => ({ ...c, _type: 'review' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const riskColor = v => v <= 3 ? 'var(--teal)' : v <= 6 ? 'var(--amber)' : 'var(--red)'
  const riskDims  = riskData ? [
    { name: 'Test Coverage',    val: riskData.test_coverage    || 5 },
    { name: 'Breaking Changes', val: riskData.breaking_changes || 5 },
    { name: 'Security Risk',    val: riskData.security_risk    || 5 },
    { name: 'Deploy Impact',    val: riskData.deployment_impact || 5 },
  ] : []

  return (
    <div className="pr-body">
      {p.body && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div className="albl" style={{ marginBottom: 6 }}>Description</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {p.body.slice(0, 800)}{p.body.length > 800 ? '…' : ''}
          </div>
        </div>
      )}

      <div className="ag">
        <div className="abox abox-plain">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'var(--gold-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" width="11" height="11"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div className="albl">What This PR Does</div>
          </div>
          <div className="acontent" dangerouslySetInnerHTML={{ __html: renderPlainSummary(analysis.summary) }}></div>
        </div>

        <div className="abox abox-tech">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'rgba(96,165,250,.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" width="11" height="11"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </div>
            <div className="albl">Technical Impact</div>
          </div>
          <div className="acontent" dangerouslySetInnerHTML={{ __html: renderTechImpact(analysis.technical_impact) }}></div>
        </div>

        <div className="abox abox-review">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'var(--teal-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" width="11" height="11"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <div className="albl">Review Status</div>
          </div>
          <span className={`rev-badge ${revCls}`}>{splitLabel(sentiment)[0]}</span>
          <div className="acontent" style={{ marginTop: 6 }}>{splitLabel(sentiment)[1]}</div>
        </div>

        <div className="abox abox-qlt">
          <div className="abox-hdr">
            <div className="abox-icon" style={{ background: 'var(--amber-dim)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div className="albl">PR Quality</div>
          </div>
          <div dangerouslySetInnerHTML={{ __html: renderQualityBadge(analysis.quality) }}></div>
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div className="albl">Files Changed ({files.length})</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                className="abtn"
                onClick={handleAIReview}
                disabled={aiReviewLoading}
                style={{ fontSize: 11, padding: '4px 10px', color: 'var(--gold)', borderColor: 'rgba(201,168,76,.3)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                {aiReviewLoading ? 'Reviewing…' : aiReview ? (showAIReview ? 'Hide Review' : 'AI Review') : 'AI Review'}
              </button>
              <button
                className="abtn"
                onClick={handleRiskScore}
                disabled={riskLoading}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {riskLoading ? 'Scoring…' : riskData ? (showRisk ? 'Hide Risk' : 'Risk Score') : 'Risk Score'}
              </button>
              <button
                className="abtn"
                onClick={() => setShowDiff(s => !s)}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                {showDiff ? 'Hide Diff' : 'Show Diff'}
              </button>
            </div>
          </div>

          {/* Risk meter */}
          {showRisk && (
            riskLoading
              ? <ThinkingDots messages={['Analysing changed files…', 'Checking for tests…', 'Scoring risk dimensions…', 'Calculating impact…']} />
              : riskData && (
                <div className="risk-meter-wrap" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div className="risk-meter-label">Overall Risk Score</div>
                      <div className="risk-meter-score" style={{ color: riskColor(riskData.overall || 5) }}>
                        {riskData.overall || 5}<span style={{ fontSize: 14, color: 'var(--text3)' }}>/10</span>
                      </div>
                    </div>
                    <button onClick={() => setShowRisk(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1 }}>✕</button>
                  </div>
                  <div>
                    {riskDims.map(d => (
                      <div key={d.name} className="risk-dim">
                        <span className="risk-dim-name">{d.name}</span>
                        <div className="risk-dim-track"><div className="risk-dim-bar" style={{ width: `${d.val * 10}%`, background: riskColor(d.val) }}></div></div>
                        <span className="risk-dim-val" style={{ color: riskColor(d.val) }}>{d.val}</span>
                      </div>
                    ))}
                  </div>
                  {riskData.rationale && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>{riskData.rationale}</div>
                  )}
                </div>
              )
          )}

          {/* AI Review */}
          {showAIReview && (
            aiReviewLoading
              ? <ThinkingDots messages={['Reading the diff…', 'Scanning changed files…', 'Identifying concerns…', 'Finalising review…']} />
              : aiReview && (
                <div className="ai-review-wrap" style={{ marginBottom: 10 }}>
                  <div className="ai-review-hdr">
                    <span className="ai-review-hdr-title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      AI Code Review
                      {(() => {
                        const count = aiReview.issues?.length || 0
                        return <span style={{ background: count > 0 ? 'var(--red-dim)' : 'var(--teal-dim)', color: count > 0 ? 'var(--red)' : 'var(--teal)', fontSize: 10, padding: '1px 8px', borderRadius: 10 }}>{count > 0 ? count + ' issue' + (count > 1 ? 's' : '') : 'Looks good'}</span>
                      })()}
                    </span>
                    <button onClick={() => setShowAIReview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: 2 }}>✕</button>
                  </div>
                  <div className="ai-review-body">
                    {aiReview.summary && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, lineHeight: 1.5, padding: '8px 10px', background: 'var(--s2)', borderRadius: 6 }}>{aiReview.summary}</div>
                    )}
                    {(aiReview.issues?.length || 0) === 0
                      ? <div style={{ fontSize: 12, color: 'var(--teal)' }}>No significant issues found. Code looks clean.</div>
                      : (aiReview.issues || []).map((issue, i) => (
                          <div key={i} className={`ar-item ar-${issue.severity || 'info'}`}>
                            <div className="ar-sev">{issue.severity || 'info'}</div>
                            {issue.file && <div className="ar-file">{issue.file}</div>}
                            <div className="ar-desc">{issue.description}</div>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )
          )}

          {/* Diff view */}
          {showDiff && (
            <div style={{ marginBottom: 10 }} dangerouslySetInnerHTML={{ __html: renderDiff(files) }}></div>
          )}

          {/* File list */}
          <div className="pr-files-list">
            {files.map(f => (
              <div key={f.filename} className="pr-file-row">
                <span className="pr-fname">{f.filename}</span>
                <span className="fadd">+{f.additions}</span>
                <span className="fdel">-{f.deletions}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {allComments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="albl" style={{ marginBottom: 10 }}>Comments ({allComments.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allComments.map((c, i) => (
              <div key={i} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div className="av" style={{ background: avatarColor(c.user.login), width: 20, height: 20, fontSize: 9 }}>{avatarInitial(c.user.login)}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.user.login}</span>
                  {c._type === 'review' && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'var(--teal-dim)', color: 'var(--teal)' }}>inline</span>}
                  {c.path && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{c.path}</span>}
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {(c.body || '').slice(0, 500)}{(c.body || '').length > 500 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit review */}
      {p.state === 'open' && (
        <div style={{ marginTop: 18, border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--s2)' }}>
          <div className="albl" style={{ marginBottom: 12 }}>Submit a Review</div>
          <textarea
            rows="3"
            placeholder="Leave a review comment (optional)..."
            value={reviewBody}
            onChange={e => setReviewBody(e.target.value)}
            style={{ width: '100%', background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.5, marginBottom: 10 }}
          ></textarea>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="abtn" style={{ color: '#4ADE80', borderColor: 'rgba(74,222,128,.3)' }} onClick={() => submitReview('APPROVE')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>Approve
            </button>
            <button className="abtn" style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={() => submitReview('REQUEST_CHANGES')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Request Changes
            </button>
            <button className="abtn" onClick={() => submitReview('COMMENT')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>Comment
            </button>
            {reviewStatus && <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>{reviewStatus}</span>}
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="act-row">
        <a className="abtn" href={`https://github.com/${currentRepo?.full_name || ''}/pull/${num}`} target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View on GitHub
        </a>
        <button className="abtn" onClick={() => onCopyLink(num)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          Copy Link
        </button>
        {p.state === 'open' && <>
          <button className="abtn" style={{ color: '#4ADE80', borderColor: 'rgba(74,222,128,.3)' }} onClick={() => onMerge(num)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7M6 9v12"/></svg>Merge PR
          </button>
          <button className="abtn" style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={() => onClose(num)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close PR
          </button>
        </>}
      </div>
    </div>
  )
}
