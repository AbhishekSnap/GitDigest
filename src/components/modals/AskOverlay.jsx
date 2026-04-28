import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { submitAskQuery } from '../../api/anthropic.js'

function renderMarkdown(raw) {
  if (!raw) return ''

  function inline(s) {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  }

  const lines = raw.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('### ')) { out.push(`<h4 class="ask-h4">${inline(line.slice(4))}</h4>`); i++; continue }
    if (line.startsWith('## '))  { out.push(`<h3 class="ask-h3">${inline(line.slice(3))}</h3>`); i++; continue }
    if (line.startsWith('# '))   { out.push(`<h2 class="ask-h2">${inline(line.slice(2))}</h2>`); i++; continue }

    if (line.startsWith('> ')) {
      out.push(`<blockquote class="ask-bq">${inline(line.slice(2))}</blockquote>`)
      i++; continue
    }

    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
      const [header, , ...body] = rows
      const ths = header.split('|').slice(1, -1).map(h => `<th>${inline(h.trim())}</th>`).join('')
      const trs = body.map(r =>
        `<tr>${r.split('|').slice(1, -1).map(d => `<td>${inline(d.trim())}</td>`).join('')}</tr>`
      ).join('')
      out.push(`<table class="ask-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`)
      continue
    }

    if (line.match(/^[-*] /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(`<li>${inline(lines[i].slice(2))}</li>`); i++
      }
      out.push(`<ul class="ask-ul">${items.join('')}</ul>`)
      continue
    }

    if (line.match(/^---+$/)) { out.push('<hr class="ask-hr">'); i++; continue }
    if (line.trim() === '') { i++; continue }

    out.push(`<p>${inline(line)}</p>`)
    i++
  }

  return out.join('')
}

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
            <div className="ask-card" dangerouslySetInnerHTML={{ __html: renderMarkdown(answer) }} />
          </div>
        )}
      </div>
    </div>
  )
}
