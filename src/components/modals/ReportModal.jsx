import { useState } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { generateReport } from '../../api/anthropic.js'
import { fetchAllCommits, fetchAllPRs } from '../../api/github.js'

const PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: 0 },
]

export default function ReportModal({ onClose }) {
  const { API, currentRepo } = useStore()
  const toast = useToast()

  const [client, setClient]   = useState('')
  const [days, setDays]       = useState(30)
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState('')

  async function generate() {
    if (!client.trim()) { setStatus('Enter a client name first'); return }
    setLoading(true)
    setStatus('Fetching repo data…')
    try {
      const since = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : undefined
      const [commits, prs] = await Promise.all([
        fetchAllCommits(API, since),
        fetchAllPRs(API),
      ])
      setStatus('Generating report with Claude…')
      const html = await generateReport({
        repoName: currentRepo?.full_name || 'Unknown Repo',
        clientName: client.trim(),
        commits, prs, days,
      })
      downloadReport(html, client.trim())
      toast('✅', 'Report generated', 'Downloaded as HTML')
      onClose()
    } catch (e) {
      if (e.message === 'no-key') {
        toast('🔑', 'API Key Required', 'Add your Anthropic API key in Settings')
      } else {
        setStatus('Failed: ' + e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function downloadReport(html, clientName) {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `git-digest-${clientName.toLowerCase().replace(/\s+/g, '-')}-report.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--s1)', border: '1px solid var(--border2)', borderRadius: 'var(--r-card)', width: 480, maxWidth: 'calc(100vw - 32px)', padding: 28, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}>✕</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 20 }}>Generate Client Report</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Client / Project Name</div>
          <input
            type="text"
            value={client}
            onChange={e => setClient(e.target.value)}
            placeholder="Acme Corp"
            style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 8 }}>Date Range</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {PRESETS.map(p => (
              <button
                key={p.days}
                className={`ftab${days === p.days ? ' active' : ''}`}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {status && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, minHeight: 18 }}>{status}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
            {loading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
