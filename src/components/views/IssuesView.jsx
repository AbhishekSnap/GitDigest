import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchIssues, ghWrite } from '../../api/github.js'
import { timeAgo, esc } from '../../utils/index.js'

export default function IssuesView({ onIssueCountChange }) {
  const { API, currentRepo } = useStore()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('open')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: issues = [], isLoading, error, refetch } = useQuery({
    queryKey: ['issues', API, filter],
    queryFn: () => fetchIssues(API, filter),
    enabled: !!API,
  })

  useEffect(() => {
    if (issues.length && onIssueCountChange) {
      onIssueCountChange(issues.filter(i => i.state === 'open').length)
    }
  }, [issues])

  async function handleCloseIssue(num) {
    if (!confirm(`Close issue #${num}?`)) return
    try {
      await ghWrite('PATCH', `${API}/issues/${num}`, { state: 'closed' })
      toast('✅', 'Issue closed', `#${num} closed`)
      queryClient.invalidateQueries({ queryKey: ['issues', API] })
    } catch (e) { toast('❌', 'Failed', e.message) }
  }

  return (
    <div className="view active" id="view-issues">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="filter-tabs" id="issue-filters">
          {['open','closed','all'].map(f => (
            <button key={f} className={`ftab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowCreateModal(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Issue
        </button>
      </div>

      <div id="issue-list">
        {isLoading ? (
          <>
            <div className="skeleton" style={{ height: 60, marginBottom: 8 }}></div>
            <div className="skeleton" style={{ height: 60 }}></div>
          </>
        ) : error ? (
          <div className="empty-state"><h3>Failed to load issues</h3><p>{error.message}</p></div>
        ) : issues.length === 0 ? (
          <div className="empty-state"><h3>No issues</h3><p>Try a different filter.</p></div>
        ) : issues.map(i => {
          const isOpen = i.state === 'open'
          return (
            <div key={i.number} className="issue-card">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"
                className={isOpen ? 'issue-icon-open' : 'issue-icon-closed'}
                style={{ flexShrink: 0, marginTop: 2 }}
              >
                <path d={isOpen
                  ? 'M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0z'
                  : 'M11.28 6.78a.75.75 0 00-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0z'
                }/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="issue-title">{i.title}</div>
                <div className="issue-meta">
                  #{i.number} · opened {timeAgo(i.created_at)} by {i.user?.login || '?'}
                  {(i.labels || []).map(l => (
                    <span key={l.id} style={{ background: `#${l.color}22`, color: `#${l.color}`, fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="issue-actions">
                {isOpen && (
                  <button className="abtn" style={{ color: 'var(--red)', borderColor: 'var(--red-dim)', fontSize: 11 }} onClick={() => handleCloseIssue(i.number)}>
                    Close
                  </button>
                )}
                <a className="abtn" style={{ fontSize: 11 }} href={`https://github.com/${currentRepo?.full_name}/issues/${i.number}`} target="_blank" rel="noopener">View</a>
              </div>
            </div>
          )
        })}
      </div>

      {showCreateModal && (
        <CreateIssueModal
          API={API}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            queryClient.invalidateQueries({ queryKey: ['issues', API] })
          }}
        />
      )}
    </div>
  )
}

function CreateIssueModal({ API, onClose, onCreated }) {
  const toast = useToast()
  const [title, setTitle]   = useState('')
  const [body, setBody]     = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!title.trim()) { setStatus('Title is required'); return }
    setLoading(true); setStatus('Creating…')
    try {
      const issue = await ghWrite('POST', `${API}/issues`, { title: title.trim(), body: body.trim() })
      toast('✅', 'Issue created', `#${issue.number} opened`)
      onCreated()
    } catch (e) { setStatus('Failed: ' + e.message); setLoading(false) }
  }

  return (
    <div id="create-issue-modal" style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-card)', width: 500, maxWidth: 'calc(100vw - 32px)', padding: 28, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Open New Issue</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Title</div>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title" style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Description (optional)</div>
          <textarea rows="5" value={body} onChange={e => setBody(e.target.value)} placeholder="Describe the issue..." style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.5 }}></textarea>
        </div>
        {status && <div style={{ fontSize: 12, color: 'var(--text3)', minHeight: 18, marginBottom: 12 }}>{status}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>Open Issue</button>
        </div>
      </div>
    </div>
  )
}
