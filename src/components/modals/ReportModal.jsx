import { useState } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { generateReport } from '../../api/anthropic.js'
import { fetchAllCommits, fetchAllPRs } from '../../api/github.js'
import { detectType, esc } from '../../utils/index.js'

const today    = () => new Date().toISOString().slice(0, 10)
const daysAgo  = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

export default function ReportModal({ onClose }) {
  const { API, currentRepo } = useStore()
  const toast = useToast()

  const [client, setClient]     = useState('')
  const [fromDate, setFromDate] = useState(daysAgo(30))
  const [toDate, setToDate]     = useState(today())
  const [preset, setPreset]     = useState(30)
  const [loading, setLoading]   = useState(false)
  const [status, setStatus]     = useState('')

  function applyPreset(days) {
    setPreset(days)
    setFromDate(days === 0 ? '' : daysAgo(days))
    setToDate(today())
  }

  async function generate() {
    if (!fromDate || !toDate) { toast('⚠️', 'Dates required', 'Pick a from and to date'); return }
    setLoading(true)
    setStatus('Loading commits…')
    try {
      const [allCommits, allPRs] = await Promise.all([
        fetchAllCommits(API),
        fetchAllPRs(API),
      ])

      const from     = fromDate
      const to       = toDate
      const clientName = client.trim() || currentRepo?.full_name || 'Project'
      const fromDt   = new Date(from)
      const toDt     = new Date(to + 'T23:59:59')

      const periodCommits = allCommits.filter(c => {
        const d = new Date(c.commit.author.date)
        return d >= fromDt && d <= toDt
      })
      const periodPRs = allPRs.filter(p => {
        const d = new Date(p.created_at)
        return d >= fromDt && d <= toDt
      })

      const mergedPRs = periodPRs.filter(p => p.merged_at)
      const openPRs   = periodPRs.filter(p => p.state === 'open')
      const features  = periodCommits.filter(c => detectType(c.commit.message) === 'Feature')
      const bugfixes  = periodCommits.filter(c => detectType(c.commit.message) === 'Bug Fix')
      const authors   = [...new Set(periodCommits.map(c => c.commit.author.name))]

      const authorCounts = {}
      periodCommits.forEach(c => { const a = c.commit.author.name; authorCounts[a] = (authorCounts[a] || 0) + 1 })

      const weekBuckets = {}
      periodCommits.forEach(c => {
        const d = new Date(c.commit.author.date)
        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const wk = monday.toISOString().slice(0, 10)
        if (!weekBuckets[wk]) weekBuckets[wk] = { commits: 0, features: 0, fixes: 0 }
        weekBuckets[wk].commits++
        const t = detectType(c.commit.message)
        if (t === 'Feature') weekBuckets[wk].features++
        if (t === 'Bug Fix') weekBuckets[wk].fixes++
      })
      const weekRows = Object.entries(weekBuckets).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)

      let avgMergeHrs = 0
      const mergedWithTime = mergedPRs.filter(p => p.created_at && p.merged_at)
      if (mergedWithTime.length) {
        avgMergeHrs = Math.round(mergedWithTime.reduce((s, p) =>
          s + (new Date(p.merged_at) - new Date(p.created_at)) / 3600000, 0) / mergedWithTime.length)
      }

      const chronoCommits = [...periodCommits].reverse()
      const commitSummary = chronoCommits.map(c =>
        `${c.commit.author.date.slice(0, 10)} | ${c.commit.author.name} | ${detectType(c.commit.message)} | ${c.commit.message.split('\n')[0].slice(0, 90)}`
      ).join('\n')

      const chronoPRs = [...periodPRs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      const prSummary = chronoPRs.map(p =>
        `${p.created_at.slice(0, 10)} | ${p.user.login} | PR #${p.number} | ${p.title}${p.merged_at ? ' | merged ' + p.merged_at.slice(0, 10) : ' | ' + p.state}`
      ).join('\n')

      const openPRSummary = openPRs.slice(0, 10).map(p =>
        `PR #${p.number} "${p.title}" by ${p.user.login}, open since ${p.created_at.slice(0, 10)}`
      ).join('\n')
      const avgCycleStr = avgMergeHrs > 0 ? (avgMergeHrs < 24 ? avgMergeHrs + ' hours' : Math.round(avgMergeHrs / 24) + ' days') : 'N/A'

      const prompt = `You are writing a professional project progress report for a client or manager. Audience: non-technical. No code, no jargon, no git terms, no branch names, no commit hashes.\n\nProject: ${clientName}\nRepository: ${currentRepo?.full_name}\nLanguage: ${currentRepo?.language || 'Unknown'}\nDescription: ${currentRepo?.description || 'Not provided'}\nPeriod: ${from} to ${to}\n\nMetrics:\n- Commits in period: ${periodCommits.length}\n- Contributors: ${authors.join(', ')}\n- Merged PRs: ${mergedPRs.length}\n- Open PRs: ${openPRs.length}\n- Features: ${features.length}, Bug fixes: ${bugfixes.length}\n- Avg merge cycle: ${avgCycleStr}\n\nCHRONOLOGICAL COMMIT LOG (oldest first): DATE | AUTHOR | TYPE | MESSAGE\n${commitSummary || 'None'}\n\nCHRONOLOGICAL PR LOG (oldest first): DATE | AUTHOR | PR# | TITLE | STATUS\n${prSummary || 'None'}\n\nOPEN / IN PROGRESS:\n${openPRSummary || 'None'}\n\nReturn a JSON object with EXACTLY these keys:\n\n"period_label": short label like "April 2026" or "Q1 2026"\n\n"project_overview": object with:\n  "what": 2-3 sentences — what this project is, what it does, and who uses it. Infer from repo name, description, language, and commit/PR content. Be specific, not generic.\n  "domain": 1 word or short phrase — e.g. "E-commerce platform", "Data pipeline", "Developer tooling", "Mobile app"\n  "tech_note": 1 sentence — the technology stack in plain English, e.g. "Built with Python and Snowflake" or "A React web application backed by a Node.js API"\n\n"executive_summary": array of 5-7 strings. EVERY bullet must name specific actual work — features built, modules added, problems fixed. No generic statements. Draw directly from the PR titles and commit messages. Each bullet 1-2 sentences.\n\n"key_metrics_narrative": 3-4 sentences on delivery pace, efficiency, team productivity in business terms.\n\n"timeline": array of 10-15 significant milestone objects ordered chronologically (oldest first), each:\n  "date": "YYYY-MM-DD"\n  "type": one of: "feature" | "fix" | "improvement" | "milestone" | "infrastructure"\n  "title": 4-8 words, plain English, what was delivered\n  "description": 1-2 sentences explaining what changed and its impact\n  "author": contributor name from the log\nPick the most significant events — major features, notable fixes, architectural changes, and key milestones. Do NOT include trivial commits.\n\n"features_shipped": array of up to 10 objects, each:\n  "title": 6-10 words plain English\n  "description": 2-3 sentences — what was built, how it works, business value\n  "author": contributor name\n  "date": "YYYY-MM-DD"\n\n"issues_resolved": array of up to 8 objects, each:\n  "title": short plain-English label\n  "description": 1-2 sentences — what was broken, impact, how resolved\n  "author": contributor name\n  "date": "YYYY-MM-DD"\n\n"in_progress": array of up to 6 objects, each with "title", "description", "author"\n\n"team_highlights": 3-4 sentences on team contributions, standout effort, collaboration quality.\n\n"process_health": 3-4 sentences on review coverage, pace consistency, release cadence.\n\n"risk_summary": 2-3 sentences on risks visible in the data. If healthy, say why.\n\n"recommendations": array of 3-4 specific actionable strings.\n\nRules: No em dashes, no bullet symbols, no markdown, no jargon. Commas and colons only. Return ONLY valid JSON.`

      setStatus('Claude is reading the project history…')
      const r = await generateReport(prompt)

      setStatus('Building document…')
      const stats = {
        totalCommits: periodCommits.length,
        mergedCount: mergedPRs.length,
        openCount: openPRs.length,
        featureCount: features.length,
        bugCount: bugfixes.length,
        avgMergeHrs,
        authors,
        authorCounts,
        weekRows,
      }
      buildAndDownloadReport(r, clientName, from, to, stats, currentRepo)
      toast('✅', 'Report ready', 'Document downloaded')
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

  return (
    <div className="overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>

        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18, lineHeight: 1 }}
        >✕</button>

        <div className="modal-title">Generate Client Report</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -10, marginBottom: 20, lineHeight: 1.5 }}>
          AI-written plain-English summary of work done — ready to download and present
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[{ label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }, { label: 'All time', days: 0 }].map(p => (
            <button
              key={p.days}
              className={`btn${preset === p.days ? ' btn-primary' : ''}`}
              style={{ fontSize: 12 }}
              onClick={() => applyPreset(p.days)}
            >{p.label}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>From</div>
            <input
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPreset(-1) }}
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', colorScheme: 'dark' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>To</div>
            <input
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPreset(-1) }}
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none', colorScheme: 'dark' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>Project / Client Name (optional)</div>
          <input
            type="text"
            value={client}
            onChange={e => setClient(e.target.value)}
            placeholder="e.g. Acme Corp — Q2 Sprint"
            style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13, outline: 'none' }}
          />
        </div>

        {status && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>{status}</div>}

        <button
          className="btn btn-primary"
          onClick={generate}
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '12px 20px' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          {loading ? 'Generating…' : 'Generate with AI'}
        </button>
      </div>
    </div>
  )
}

function buildAndDownloadReport(r, client, from, to, stats, currentRepo) {
  const { totalCommits, mergedCount, openCount, featureCount, bugCount, avgMergeHrs, authors, authorCounts, weekRows } = stats
  const now      = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtD     = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const fmtShort = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const avgMergeFmt = avgMergeHrs > 0 ? (avgMergeHrs < 24 ? avgMergeHrs + 'h' : Math.round(avgMergeHrs / 24) + 'd') : 'N/A'
  const initials = n => (n || '?').split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('')

  const weekTableRows = weekRows.map(([wk, v]) =>
    `<tr><td>${new Date(wk).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td><td>${v.commits}</td><td>${v.features}</td><td>${v.fixes}</td></tr>`
  ).join('')

  const authorRows = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).map(([name, cnt]) =>
    `<tr><td><span class="av-chip-sm">${initials(name)}</span>${esc(name)}</td><td style="font-weight:600">${cnt}</td><td>
      <div style="background:#e8e8e8;border-radius:4px;height:6px;width:100%"><div style="background:#1a1a2e;height:6px;border-radius:4px;width:${Math.min(100, Math.round(cnt / Math.max(...Object.values(authorCounts)) * 100))}%"></div></div>
    </td></tr>`
  ).join('')

  const typeColor = { feature: '#2e7d32', fix: '#c62828', improvement: '#1565c0', milestone: '#6a1b9a', infrastructure: '#37474f' }
  const typeBg    = { feature: '#e8f5e9', fix: '#fce4ec', improvement: '#e3f2fd', milestone: '#f3e5f5', infrastructure: '#eceff1' }
  const typeLabel = { feature: 'Feature', fix: 'Fix', improvement: 'Improvement', milestone: 'Milestone', infrastructure: 'Infrastructure' }

  const timelineHtml = (r.timeline || []).map((t, i) => {
    const tc = typeColor[t.type] || '#555'
    const tb = typeBg[t.type] || '#f5f5f5'
    const tl = typeLabel[t.type] || t.type
    return `<div class="tl-item">
      <div class="tl-left">
        <div class="tl-date">${t.date ? fmtShort(t.date) : ''}</div>
        <div class="tl-author-chip" title="${esc(t.author || '')}">${initials(t.author || '?')}</div>
      </div>
      <div class="tl-connector"><div class="tl-dot" style="background:${tc}"></div>${i < (r.timeline || []).length - 1 ? '<div class="tl-line"></div>' : ''}</div>
      <div class="tl-card">
        <span class="tl-badge" style="background:${tb};color:${tc}">${esc(tl)}</span>
        <div class="tl-title">${esc(t.title || '')}</div>
        <div class="tl-desc">${esc(t.description || '')}</div>
        ${t.author ? `<div class="tl-by">by ${esc(t.author)}</div>` : ''}
      </div>
    </div>`
  }).join('')

  const featureCard = (f, tag, tagColor, tagBg) => {
    if (typeof f === 'string') return `<div class="fc"><div class="fc-left"><span class="fc-tag" style="color:${tagColor};background:${tagBg}">${tag}</span></div><div class="fc-body"><div class="fc-title">${esc(f)}</div></div></div>`
    return `<div class="fc">
      <div class="fc-left"><span class="fc-tag" style="color:${tagColor};background:${tagBg}">${tag}</span></div>
      <div class="fc-body">
        <div class="fc-title">${esc(f.title || '')}</div>
        <div class="fc-desc">${esc(f.description || '')}</div>
        <div class="fc-meta">${f.author ? `<span class="fc-author">${initials(f.author)} ${esc(f.author)}</span>` : ''}${f.date ? `<span class="fc-date">${fmtShort(f.date)}</span>` : ''}</div>
      </div>
    </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(client)} — Progress Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;background:#fafafa;font-size:14px;line-height:1.6}
  @media print{body{background:#fff}.print-btn{display:none!important}.page-wrap{box-shadow:none!important;border-radius:0!important}}
  .page-wrap{max-width:880px;margin:0 auto;background:#fff;box-shadow:0 0 40px rgba(0,0,0,.08);border-radius:12px;overflow:hidden}
  .cover{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);padding:52px 52px 40px;color:#fff}
  .cover-badge{display:inline-block;background:rgba(201,168,76,.2);border:1px solid rgba(201,168,76,.4);color:#c9a84c;font-size:10px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:20px}
  .cover h1{font-size:32px;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.2}
  .cover-sub{font-size:13px;color:rgba(255,255,255,.55);margin-bottom:28px}
  .cover-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:28px}
  @media(max-width:700px){.cover-kpis{grid-template-columns:repeat(3,1fr)}}
  .ckpi{background:rgba(255,255,255,.07);border-radius:10px;padding:14px 10px;text-align:center;border:1px solid rgba(255,255,255,.1)}
  .ckpi-val{font-size:26px;font-weight:700;color:#fff;line-height:1}
  .ckpi-lbl{font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.7px;margin-top:5px}
  .body-wrap{padding:44px 52px}
  .section{margin-bottom:40px}
  h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#aaa;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:8px}
  h2 .h2-accent{width:3px;height:14px;border-radius:2px;background:#c9a84c;display:inline-block}
  .project-card{background:#fffbf0;border:1px solid #f0e0a0;border-radius:12px;padding:22px 24px;margin-bottom:8px}
  .project-domain{display:inline-block;background:#1a1a2e;color:#c9a84c;font-size:10px;font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:.8px;text-transform:uppercase;margin-bottom:12px}
  .project-what{font-size:15px;line-height:1.75;color:#222;margin-bottom:10px;font-weight:400}
  .project-tech{font-size:12px;color:#888;font-style:italic}
  .exec{background:#fffbf0;border-left:4px solid #c9a84c;padding:20px 24px;border-radius:0 12px 12px 0}
  .exec ul{padding-left:18px;display:flex;flex-direction:column;gap:10px;list-style:disc}
  .exec ul li{font-size:14px;line-height:1.7;color:#222}
  .exec ul li::marker{color:#c9a84c;font-size:16px}
  .narrative{font-size:14px;line-height:1.75;color:#444;background:#f8f8f8;padding:18px 22px;border-radius:10px}
  .timeline{display:flex;flex-direction:column;gap:0}
  .tl-item{display:grid;grid-template-columns:110px 28px 1fr;gap:0 16px;align-items:start}
  .tl-left{display:flex;flex-direction:column;align-items:flex-end;gap:6px;padding-top:4px;min-width:0}
  .tl-date{font-size:10px;color:#aaa;text-align:right;line-height:1.3;white-space:nowrap}
  .tl-author-chip{width:24px;height:24px;border-radius:50%;background:#1a1a2e;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto}
  .tl-connector{display:flex;flex-direction:column;align-items:center;padding-top:6px}
  .tl-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;border:2px solid #fff;box-shadow:0 0 0 2px currentColor;margin-top:2px}
  .tl-line{width:2px;background:#e8e8e8;flex:1;margin-top:6px;min-height:32px}
  .tl-card{background:#fff;border:1px solid #eee;border-radius:10px;padding:14px 16px;margin-bottom:14px}
  .tl-badge{font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:.5px;text-transform:uppercase;display:inline-block;margin-bottom:7px}
  .tl-title{font-size:13px;font-weight:600;color:#1a1a2e;margin-bottom:5px;line-height:1.4}
  .tl-desc{font-size:12px;color:#666;line-height:1.6}
  .tl-by{font-size:11px;color:#aaa;margin-top:6px}
  .fc{display:grid;grid-template-columns:68px 1fr;gap:14px;border:1px solid #eee;border-radius:10px;padding:14px 16px;margin-bottom:10px;align-items:start}
  .fc-left{display:flex;flex-direction:column;align-items:center;gap:6px}
  .fc-tag{font-size:9px;font-weight:700;padding:3px 8px;border-radius:5px;letter-spacing:.5px;text-transform:uppercase;text-align:center;line-height:1.3}
  .fc-title{font-weight:600;font-size:13px;color:#1a1a2e;margin-bottom:5px;line-height:1.4}
  .fc-desc{font-size:12px;color:#555;line-height:1.65;margin-bottom:8px}
  .fc-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .fc-author{font-size:10px;color:#888;display:flex;align-items:center;gap:5px}
  .fc-date{font-size:10px;color:#bbb;font-style:italic}
  .team-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media(max-width:580px){.team-grid{grid-template-columns:1fr}}
  .team-narrative{background:#f8f8f8;border-radius:10px;padding:18px 20px;font-size:14px;line-height:1.7;color:#333}
  .av-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .av-chip{background:#1a1a2e;color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .av-chip-sm{background:#1a1a2e;color:#fff;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;vertical-align:middle;margin-right:5px}
  table.data{width:100%;border-collapse:collapse;font-size:13px}
  table.data th{text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#aaa;padding:6px 10px;border-bottom:2px solid #f0f0f0}
  table.data td{padding:9px 10px;border-bottom:1px solid #f5f5f5;color:#333;vertical-align:middle}
  table.data tr:last-child td{border-bottom:none}
  .week-table-wrap{border:1px solid #eee;border-radius:10px;overflow:hidden}
  .risk-box{background:#fffde7;border-left:4px solid #f9a825;border-radius:0 10px 10px 0;padding:16px 20px;font-size:14px;line-height:1.7;color:#555}
  .rec-list{display:flex;flex-direction:column;gap:10px}
  .rec-card{background:#f0f4ff;border-radius:8px;padding:13px 17px;font-size:13px;line-height:1.65;color:#1a237e;border-left:3px solid #3949ab;display:flex;gap:10px}
  .rec-num{font-weight:700;font-size:15px;color:#3949ab;flex-shrink:0}
  .footer{margin-top:0;padding:24px 52px;border-top:1px solid #f0f0f0;background:#fafafa;font-size:11px;color:#ccc;display:flex;align-items:center;justify-content:space-between}
  .print-btn{position:fixed;top:20px;right:20px;background:#1a1a2e;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:100}
  .print-btn:hover{background:#2d2d50}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<div class="page-wrap">
  <div class="cover">
    <div class="cover-badge">Progress Report &nbsp;·&nbsp; ${esc(r.period_label || '')}</div>
    <h1>${esc(client)}</h1>
    <div class="cover-sub">${fmtD(from)} &nbsp;to&nbsp; ${fmtD(to)} &nbsp;·&nbsp; ${esc(currentRepo?.full_name || '')} &nbsp;·&nbsp; Generated ${now}</div>
    <div class="cover-kpis">
      <div class="ckpi"><div class="ckpi-val">${totalCommits}</div><div class="ckpi-lbl">Changes</div></div>
      <div class="ckpi"><div class="ckpi-val">${mergedCount}</div><div class="ckpi-lbl">Delivered</div></div>
      <div class="ckpi"><div class="ckpi-val">${openCount}</div><div class="ckpi-lbl">In Progress</div></div>
      <div class="ckpi"><div class="ckpi-val">${featureCount}</div><div class="ckpi-lbl">Features</div></div>
      <div class="ckpi"><div class="ckpi-val">${bugCount}</div><div class="ckpi-lbl">Fixes</div></div>
      <div class="ckpi"><div class="ckpi-val">${avgMergeFmt}</div><div class="ckpi-lbl">Avg Cycle</div></div>
    </div>
  </div>
  <div class="body-wrap">
    ${r.project_overview ? `<div class="section">
      <h2><span class="h2-accent"></span>About This Project</h2>
      <div class="project-card">
        ${r.project_overview.domain ? `<div class="project-domain">${esc(r.project_overview.domain)}</div>` : ''}
        <div class="project-what">${esc(r.project_overview.what || '')}</div>
        ${r.project_overview.tech_note ? `<div class="project-tech">${esc(r.project_overview.tech_note)}</div>` : ''}
      </div>
    </div>` : ''}
    <div class="section">
      <h2><span class="h2-accent"></span>Executive Summary</h2>
      <div class="exec">
        ${Array.isArray(r.executive_summary)
          ? `<ul>${r.executive_summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`
          : `<p>${esc(r.executive_summary || '')}</p>`}
      </div>
    </div>
    ${r.key_metrics_narrative ? `<div class="section">
      <h2><span class="h2-accent"></span>Delivery Overview</h2>
      <div class="narrative">${esc(r.key_metrics_narrative)}</div>
    </div>` : ''}
    ${timelineHtml ? `<div class="section">
      <h2><span class="h2-accent"></span>Project Timeline</h2>
      <div class="timeline">${timelineHtml}</div>
    </div>` : ''}
    ${r.features_shipped?.length ? `<div class="section">
      <h2><span class="h2-accent"></span>Features and Improvements Delivered</h2>
      <div>${(r.features_shipped || []).map(f => featureCard(f, 'Feature', '#2e7d32', '#e8f5e9')).join('')}</div>
    </div>` : ''}
    ${r.issues_resolved?.length ? `<div class="section">
      <h2><span class="h2-accent"></span>Issues Resolved</h2>
      <div>${(r.issues_resolved || []).map(f => featureCard(f, 'Fix', '#c62828', '#fce4ec')).join('')}</div>
    </div>` : ''}
    ${r.in_progress?.length ? `<div class="section">
      <h2><span class="h2-accent"></span>In Progress</h2>
      <div>${(r.in_progress || []).map(f => featureCard(f, 'Active', '#1565c0', '#e3f2fd')).join('')}</div>
    </div>` : ''}
    <div class="section">
      <h2><span class="h2-accent"></span>Team</h2>
      <div class="team-grid">
        <div>
          <div class="team-narrative">${esc(r.team_highlights || '')}</div>
          <div class="av-chips">${authors.map(a => `<div class="av-chip" title="${esc(a)}">${initials(a)}</div>`).join('')}</div>
        </div>
        <div>
          <table class="data"><thead><tr><th>Contributor</th><th>Commits</th><th>Share</th></tr></thead><tbody>${authorRows}</tbody></table>
        </div>
      </div>
    </div>
    ${weekTableRows ? `<div class="section">
      <h2><span class="h2-accent"></span>Weekly Activity</h2>
      <div class="week-table-wrap">
        <table class="data"><thead><tr><th>Week</th><th>Commits</th><th>Features</th><th>Fixes</th></tr></thead><tbody>${weekTableRows}</tbody></table>
      </div>
    </div>` : ''}
    ${r.process_health ? `<div class="section">
      <h2><span class="h2-accent"></span>Process Health</h2>
      <div class="narrative">${esc(r.process_health)}</div>
    </div>` : ''}
    ${r.risk_summary ? `<div class="section">
      <h2><span class="h2-accent"></span>Risk Summary</h2>
      <div class="risk-box">${esc(r.risk_summary)}</div>
    </div>` : ''}
    ${r.recommendations?.length ? `<div class="section">
      <h2><span class="h2-accent"></span>Recommendations</h2>
      <div class="rec-list">${(r.recommendations || []).map((rec, i) => `<div class="rec-card"><span class="rec-num">${i + 1}</span><span>${esc(rec)}</span></div>`).join('')}</div>
    </div>` : ''}
  </div>
  <div class="footer">
    <span>${esc(currentRepo?.full_name || '')} &nbsp;·&nbsp; ${fmtD(from)} to ${fmtD(to)}</span>
    <span>Generated by Git Digest</span>
  </div>
</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${client.toLowerCase().replace(/\s+/g, '-')}-report-${from}-to-${to}.html`
  a.click()
  URL.revokeObjectURL(url)
}
