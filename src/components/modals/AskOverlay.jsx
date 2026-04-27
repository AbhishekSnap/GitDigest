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

  const [query, setQuery]   = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(q) {
    const text = (q || query).trim()
    if (!text) return
    setQuery(text)
    setLoading(true)
    setAnswer('')
    try {
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
    <div id="ask-overlay" className="open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ask-container">

        {/* Input row */}
        <div className="ask-input-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="ask-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && submit()}
            placeholder={`Ask anything about ${currentRepo?.full_name || 'this repo'}…`}
            autoFocus
          />
          <button
            className="btn btn-primary"
            onClick={() => submit()}
            disabled={loading || !query.trim()}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {loading ? '…' : 'Ask'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1, marginLeft: 4 }}
          >✕</button>
        </div>

        {/* Suggestions */}
        {!answer && !loading && (
          <div className="ask-suggestions">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="ask-pill" onClick={() => submit(s)}>{s}</button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="ai-thinking">
            <div className="ai-dots">
              <div className="ai-dot"></div>
              <div className="ai-dot"></div>
              <div className="ai-dot"></div>
            </div>
            <div className="ai-thinking-msg">Thinking…</div>
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div className="ask-result">
            <div className="ask-card">{answer}</div>
          </div>
        )}
      </div>
    </div>
  )
}
