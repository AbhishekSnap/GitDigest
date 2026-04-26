export const GH_API = 'https://api.github.com'
export const CLAUDE  = 'https://api.anthropic.com/v1/messages'
export const MODEL   = 'claude-sonnet-4-6'

export const LANG_COLORS = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5', Go:'#00ADD8',
  Rust:'#dea584', Java:'#b07219', 'C#':'#178600', 'C++':'#f34b7d',
  Ruby:'#701516', PHP:'#4F5D95', Swift:'#FA7343', Kotlin:'#A97BFF',
  Dart:'#00B4AB', Shell:'#89e051', HTML:'#e34c26', CSS:'#563d7c',
  Vue:'#41b883', Svelte:'#ff3e00',
}

export const COLORS = ['#C9A84C','#2DD4BF','#F87171','#60A5FA','#FBB040','#A78BFA','#34D399','#F472B6']

export const TYPE_COLORS = {
  Feature:'var(--teal)', 'Bug Fix':'var(--red)', Refactor:'var(--gold)',
  Chore:'var(--text3)', Docs:'var(--amber)', Tests:'#60A5FA',
  Performance:'var(--amber)', Security:'var(--red)',
}

export function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

export function fmt(txt) {
  return esc(String(txt || '').replace(/—|–/g, '-').replace(/…/g, '...'))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\\n|\n/g, '<br>')
}

export function timeAgo(d) {
  const diff = (Date.now() - new Date(d)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDate(d) {
  const dt    = new Date(d)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
  const day   = new Date(dt); day.setHours(0, 0, 0, 0)
  const label = day.getTime() === today.getTime() ? '— Today'
              : day.getTime() === yest.getTime()  ? '— Yesterday' : ''
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + label
}

export function dayKey(d) { return new Date(d).toISOString().slice(0, 10) }

export function avatarColor(name) {
  let h = 0
  for (const c of name || '?') h = (h << 5) - h + c.charCodeAt(0)
  return COLORS[Math.abs(h) % COLORS.length]
}

export function avatarInitial(name) { return (name || '?').charAt(0).toUpperCase() }

export function detectType(msg) {
  msg = (msg || '').toLowerCase()
  if (/^feat(\(|:)/.test(msg) || msg.includes('feature')) return 'Feature'
  if (/^fix(\(|:)/.test(msg)  || msg.includes('bug'))     return 'Bug Fix'
  if (/^refactor(\(|:)/.test(msg))                        return 'Refactor'
  if (/^chore(\(|:)/.test(msg))                           return 'Chore'
  if (/^docs?(\(|:)/.test(msg))                           return 'Docs'
  if (/^tests?(\(|:)/.test(msg) || msg.includes('test'))  return 'Tests'
  if (/^perf(\(|:)/.test(msg))                            return 'Performance'
  if (msg.includes('security') || msg.includes('auth'))   return 'Security'
  return 'Chore'
}

export function typeCls(t) {
  return ({
    Feature:'t-feature', 'Bug Fix':'t-bugfix', Refactor:'t-refactor',
    Chore:'t-chore', Docs:'t-docs', Tests:'t-tests',
    Performance:'t-perf', Security:'t-security',
  })[t] || 't-chore'
}

export function riskCls(r) {
  if (!r) return ''
  r = r.toLowerCase()
  if (r.startsWith('high')) return 'risk-high'
  if (r.startsWith('med'))  return 'risk-medium'
  return ''
}

export function splitLabel(s) {
  if (!s) return ['', '']
  s = s.replace(/—|–/g, '-')
  const sep = s.includes(':') ? ':' : '-'
  const idx = s.indexOf(sep)
  if (idx === -1) return [s.trim(), '']
  return [s.slice(0, idx).trim(), s.slice(idx + sep.length).trim()]
}

export function isSecurityFile(fname) {
  return /secret|password|credential|private[_-]?key|api[_-]?key|\.pem$|\.key$|\.pfx$|\.p12$|oauth|jwt|crypto|ssl|\.env/i.test(fname)
}

export function hasSecurityTouch(files) {
  return (files || []).some(f => isSecurityFile(f.filename))
}

export function cleanToken(s) { return (s || '').replace(/[^\x20-\x7E]/g, '').trim() }

export function getKey() { return cleanToken(sessionStorage.getItem('gcrmcp_api_key') || '') }

export function repoHeatScore(r) {
  const days = (Date.now() - new Date(r.pushed_at || r.updated_at)) / 86400000
  if (days <= 7)  return { cls: 'heat-hot',  pct: 100, label: 'Active this week' }
  if (days <= 30) return { cls: 'heat-warm', pct: 70,  label: 'Active this month' }
  if (days <= 90) return { cls: 'heat-cool', pct: 35,  label: 'Active this quarter' }
  return               { cls: 'heat-cold', pct: 12,  label: 'Inactive' }
}

export function repoWaveform(r, heatCls) {
  if (heatCls === 'heat-cold') return { points: '0,11 120,11', dotX: null }
  let seed = 0
  for (const c of r.full_name) seed = ((seed << 5) - seed + c.charCodeAt(0)) & 0xFFFFFFFF
  seed = Math.abs(seed) + (r.stargazers_count || 0) + (r.forks_count || 0)
  const rand = i => (((seed * 1664525 + i * 1013904223) >>> 0) / 0xFFFFFFFF)
  const cfg = {
    'heat-hot':  { spikes: 3, amp: 7, spread: 28 },
    'heat-warm': { spikes: 2, amp: 5, spread: 35 },
    'heat-cool': { spikes: 1, amp: 4, spread: 50 },
  }[heatCls]
  const pts = ['0,11']
  let lastX = 0
  for (let i = 0; i < cfg.spikes; i++) {
    const cx = Math.round(12 + rand(i * 3) * 8 + i * cfg.spread + rand(i * 7) * 10)
    lastX = cx
    const up = Math.round(cfg.amp * (0.5 + rand(i + 10) * 0.5))
    const dn = Math.round(cfg.amp * (0.3 + rand(i + 20) * 0.6))
    pts.push(`${cx-5},11`, `${cx-2},${11-up}`, `${cx+1},${11+dn}`, `${cx+5},${11-Math.round(up*0.4)}`, `${cx+9},11`)
  }
  pts.push('120,11')
  return { points: pts.join(' '), dotX: Math.min(lastX + 9, 110) }
}

// ── SVG rendering helpers ─────────────────────────────────────────────────────
export function renderPlainSummary(text) {
  if (!text) return ''
  const t = text.replace(/—|–/g, '-')
  const m = t.match(/^([^.!?]*[.!?])\s+([\s\S]+)$/)
  if (m && m[1].length < 200) {
    return `<div class="plain-lead">${esc(m[1])}</div><div class="plain-body">${fmt(m[2])}</div>`
  }
  return `<div class="plain-lead">${fmt(t)}</div>`
}

export function renderTechImpact(text) {
  if (!text) return ''
  const t = text.replace(/—|–/g, '-')
  const lines = t.split('\n').filter(l => l.trim())
  let html = ''
  for (const line of lines) {
    const s = line.trim()
    if (!s) continue
    if (s.startsWith('- ')) {
      const body = s.slice(2).trim()
      const ci = body.indexOf(':')
      if (ci > 0 && ci < 50) {
        html += `<div class="tech-bullet"><span style="color:var(--blue);flex-shrink:0;margin-top:2px">·</span><span><span class="tech-fn">${esc(body.slice(0, ci))}</span><span style="color:var(--text3)">:</span> ${esc(body.slice(ci + 1).trim())}</span></div>`
      } else {
        html += `<div class="tech-bullet"><span style="color:var(--blue);flex-shrink:0;margin-top:2px">·</span>${esc(body)}</div>`
      }
    } else {
      html += `<div class="tech-file-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${esc(s)}</div>`
    }
  }
  return html || `<div class="plain-body">${fmt(t)}</div>`
}

export function renderRiskBadge(risk) {
  const [label, reason] = splitLabel(risk || '')
  const l = (label || 'low').toLowerCase()
  const cls = l.startsWith('high') ? 'rb-high' : l.startsWith('med') ? 'rb-med' : 'rb-low'
  const icon = l.startsWith('high') ? '▲' : l.startsWith('med') ? '◆' : '●'
  return `<span class="risk-badge ${cls}">${icon} ${esc(label || 'Low')}</span>${reason ? `<div class="rb-reason">${esc(reason)}</div>` : ''}`
}

export function renderQualityBadge(quality) {
  const [label, reason] = splitLabel(quality || '')
  const good = label.startsWith('Good')
  return `<span class="qlt-badge ${good ? 'qlt-good' : 'qlt-needs'}">${good ? '✓' : '!'} ${esc(label)}</span>${reason ? `<div class="qlt-reason">${esc(reason)}</div>` : ''}`
}

export function renderDiff(files) {
  return files.map(f => {
    const patch = f.patch || ''
    const lines = patch.split('\n').map(line => {
      if (line.startsWith('@@')) return `<span class="diff-line hunk">${esc(line)}</span>`
      if (line.startsWith('+'))  return `<span class="diff-line add">${esc(line)}</span>`
      if (line.startsWith('-'))  return `<span class="diff-line del">${esc(line)}</span>`
      return `<span class="diff-line ctx">${esc(line)}</span>`
    }).join('')
    const statusColor = f.status === 'added' ? 'var(--green)' : f.status === 'removed' ? 'var(--red)' : 'var(--text3)'
    return `<div class="diff-file">
      <div class="diff-file-hdr" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <span class="diff-fname-mono">${esc(f.filename)}</span>
        <span style="color:${statusColor};font-size:10px;text-transform:uppercase;font-weight:600">${esc(f.status)}</span>
        <span style="color:#4ADE80;font-family:var(--mono);font-size:10px">+${f.additions}</span>
        <span style="color:var(--red);font-family:var(--mono);font-size:10px">-${f.deletions}</span>
      </div>
      ${patch ? `<div class="diff-body" style="display:none">${lines}</div>` : '<div style="padding:8px 12px;font-size:11px;color:var(--text3)">No patch available</div>'}
    </div>`
  }).join('')
}
