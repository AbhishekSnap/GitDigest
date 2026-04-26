import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { submitAskQuery } from '../../api/anthropic.js'

const SUGGESTIONS = [
  'What are the most common types of changes in this repo?',
  'Who is the most active contributor?',
  'Which files are changed the most?',
  'Are there any high-risk commits recently?',
  'Summarize open pull requests',
]

export default function AskOverlay({ onClose }) {
  const { currentRepo, API } = useStore()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [query, setQuery]     = useState('')
  const [answer, setAnswer]   = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(q) {
    const text = (q || query).trim()
    if (!text) return
    setQuery(text)
    setLoading(true)
    setAnswer('')
    try {
      // Pull from query cache for context — fall back to empty arrays
      const commitPages = queryClient.getQueryData(['commits', API])
      const commits = commitPages?.pages?.flat() ?? []
      const prPages = queryClient.getQueryData(['prs', API])
      const prs = prPages?.pages?.flat() ?? []

      const result = await submitAskQuery(text, currentRepo, commits, prs)
      setAnswer(result)
    } catch (e) {
      if (e.message === 'no-key') {
        toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
        onClose()
      } else {
        setAnswer('Error: ' + e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-card)', width: 600, maxWidth: '100%', padding: 28, position: 'relative', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>✕</button>

        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
          Ask about{' '}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--text2)' }}>{currentRepo?.full_name || 'this repo'}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && submit()}
            placeholder="Ask anything about this repository…"
            autoFocus
            style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '10px 14px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }}
          />
          <button className="btn btn-primary" onClick={() => submit()} disabled={loading || !query.trim()} style={{ fontSize: 12 }}>
            {loading ? '…' : 'Ask'}
          </button>
        </div>

        {!answer && !loading && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Suggestions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => submit(s)}
                  style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '8px 12px', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
            Thinking…
          </div>
        )}

        {answer && (
          <div style={{ flex: 1, overflowY: 'auto', marginTop: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Answer</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{answer}</div>
          </div>
        )}
      </div>
    </div>
  )
}
