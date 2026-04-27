import { useState, useMemo, useEffect } from 'react'
import useStore from '../store/useStore.js'
import { useToast } from '../context/ToastContext.jsx'
import { fetchAllRepos as apiFetchAllRepos, fetchUser } from '../api/github.js'
import {
  timeAgo, avatarColor, avatarInitial,
  LANG_COLORS, repoHeatScore, repoWaveform, esc,
} from '../utils/index.js'

function getPinnedRepos() { return JSON.parse(localStorage.getItem('gd_pinned') || '[]') }
function togglePin(fullName) {
  const pins = getPinnedRepos()
  const idx  = pins.indexOf(fullName)
  if (idx >= 0) pins.splice(idx, 1); else pins.unshift(fullName)
  localStorage.setItem('gd_pinned', JSON.stringify(pins))
}

export default function ReposScreen() {
  const { ghUser, allRepos, setAllRepos, setUser, selectRepo, disconnect } = useStore()
  const toast = useToast()

  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('all')
  const [sort, setSort]             = useState('pushed')
  const [pinVersion, setPinVersion] = useState(0)
  const [repoLoading, setRepoLoading] = useState(false)

  useEffect(() => {
    if (!ghUser) {
      fetchUser().then(user => { if (user?.login) setUser(user) }).catch(() => {})
    }
    if (!allRepos.length) {
      setRepoLoading(true)
      apiFetchAllRepos()
        .then(repos => { setAllRepos(repos); setRepoLoading(false) })
        .catch(() => setRepoLoading(false))
    }
  }, [])

  function handleTogglePin(e, fullName) {
    e.stopPropagation()
    togglePin(fullName)
    setPinVersion(v => v + 1)
  }

  const pinnedKeys = useMemo(() => getPinnedRepos(), [pinVersion])
  const recentKeys = useMemo(() => JSON.parse(localStorage.getItem('gd_recent_repos') || '[]'), [])
  const pinnedSet  = useMemo(() => new Set(pinnedKeys), [pinnedKeys])
  const recentSet  = useMemo(() => new Set(recentKeys), [recentKeys])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = allRepos.filter(r => {
      if (q && !r.full_name.toLowerCase().includes(q) && !(r.description || '').toLowerCase().includes(q)) return false
      if (filter === 'owner'  && (r.fork || r.owner?.login !== ghUser?.login)) return false
      if (filter === 'fork'   && !r.fork) return false
      if (filter === 'issues' && !r.open_issues_count) return false
      return true
    })
    return [...list].sort((a, b) => {
      if (sort === 'stars')  return (b.stargazers_count || 0) - (a.stargazers_count || 0)
      if (sort === 'forks')  return (b.forks_count || 0) - (a.forks_count || 0)
      if (sort === 'name')   return a.name.localeCompare(b.name)
      if (sort === 'issues') return (b.open_issues_count || 0) - (a.open_issues_count || 0)
      return new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at)
    })
  }, [allRepos, search, filter, sort, ghUser, pinVersion])

  const showSections = !search && filter === 'all' && sort === 'pushed'
  const pinnedRepos  = showSections ? pinnedKeys.map(k => allRepos.find(r => r.full_name === k)).filter(Boolean) : []
  const recentRepos  = showSections ? recentKeys.map(k => allRepos.find(r => r.full_name === k)).filter(Boolean).filter(r => !pinnedSet.has(r.full_name)) : []
  const shownKeys    = showSections ? new Set([...pinnedKeys, ...recentKeys]) : new Set()
  const remaining    = showSections ? filtered.filter(r => !shownKeys.has(r.full_name)) : filtered

  return (
    <div className="screen-overlay active" id="screen-repos">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      {/* Header bar */}
      <div className="repos-header">
        <div className="repos-user">
          {ghUser?.avatar_url
            ? <img className="repos-avatar" src={ghUser.avatar_url} alt={ghUser.login} />
            : <div className="repos-avatar-placeholder">{avatarInitial(ghUser?.login)}</div>
          }
          <span className="repos-login">{ghUser?.login || '—'}</span>
        </div>
        <button
          className="btn"
          onClick={disconnect}
          style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }}
        >
          Disconnect
        </button>
      </div>

      {/* Scrollable body */}
      <div className="repos-body">

        {/* Search row */}
        <div className="repos-search-row">
          <input
            type="text"
            placeholder="Search repositories…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Toolbar: filter tabs + count + sort */}
        <div className="repos-toolbar">
          <div className="repos-toolbar-left">
            {[['all','All'],['owner','Mine'],['fork','Forks'],['issues','Has Issues']].map(([val, label]) => (
              <button
                key={val}
                className={`filter-tab${filter === val ? ' active' : ''}`}
                onClick={() => setFilter(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="repos-count">{filtered.length} repo{filtered.length !== 1 ? 's' : ''}</span>
            <select
              className="repos-sort"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="pushed">Last pushed</option>
              <option value="stars">Stars</option>
              <option value="forks">Forks</option>
              <option value="name">Name</option>
              <option value="issues">Open issues</option>
            </select>
          </div>
        </div>

        {!allRepos.length && (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>
            {repoLoading ? 'Loading repositories…' : 'No repositories found.'}
          </div>
        )}

        {showSections && pinnedRepos.length > 0 && (
          <>
            <div className="repos-section-label">Pinned</div>
            <div className="repo-grid" style={{ marginBottom: 24 }}>
              {pinnedRepos.map(r => (
                <RepoCard key={r.id} r={r} pinnedSet={pinnedSet} recentSet={recentSet} onPin={handleTogglePin} onSelect={selectRepo} />
              ))}
            </div>
          </>
        )}

        {showSections && recentRepos.length > 0 && (
          <>
            <div className="repos-section-label">Recently visited</div>
            <div className="repo-grid" style={{ marginBottom: 24 }}>
              {recentRepos.map(r => (
                <RepoCard key={r.id} r={r} pinnedSet={pinnedSet} recentSet={recentSet} onPin={handleTogglePin} onSelect={selectRepo} isRecent />
              ))}
            </div>
          </>
        )}

        {showSections && (pinnedRepos.length > 0 || recentRepos.length > 0) && remaining.length > 0 && (
          <div className="repos-section-label">All repositories</div>
        )}

        <div className="repo-grid" id="repo-grid">
          {remaining.map(r => (
            <RepoCard key={r.id} r={r} pinnedSet={pinnedSet} recentSet={recentSet} onPin={handleTogglePin} onSelect={selectRepo} isRecent={recentSet.has(r.full_name)} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RepoCard({ r, pinnedSet, recentSet, onPin, onSelect, isRecent }) {
  const lang     = r.language || ''
  const heat     = repoHeatScore(r)
  const wave     = repoWaveform(r, heat.cls)
  const isPinned = pinnedSet.has(r.full_name)

  return (
    <div className="repo-card" onClick={() => onSelect(r)} title={heat.label}>
      <button
        className={`rc-pin${isPinned ? ' pinned' : ''}`}
        onClick={e => onPin(e, r.full_name)}
        title={isPinned ? 'Unpin repo' : 'Pin repo'}
      >★</button>

      <div className="rc-top">
        <span className="rc-name">{r.name}</span>
        <span className="rc-badges">
          {r.private && <span className="rc-badge rc-private">private</span>}
          {r.fork    && <span className="rc-badge rc-fork">fork</span>}
          {isRecent  && <span className="rc-recent-badge">recent</span>}
        </span>
      </div>

      <div className="rc-desc">{r.description || 'No description'}</div>

      <div className="rc-meta">
        <span className="rc-lang">
          {lang
            ? <><span className="lang-dot" style={{ background: LANG_COLORS[lang] || 'var(--text3)' }}></span>{lang}</>
            : '—'
          }
        </span>
        <span className="rc-time">{timeAgo(r.pushed_at || r.updated_at)}</span>
      </div>

      <div className="rc-stats">
        {!!r.stargazers_count && (
          <span className="rc-stat">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>
            {r.stargazers_count}
          </span>
        )}
        {!!r.forks_count && (
          <span className="rc-stat">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/></svg>
            {r.forks_count}
          </span>
        )}
        {!!r.open_issues_count && (
          <span className="rc-stat rc-issues">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M8 5v4M8 11v.5"/></svg>
            {r.open_issues_count}
          </span>
        )}
      </div>

      <div className={`rc-heat ${heat.cls}`}>
        <div className="rc-pulse">
          <svg viewBox="0 0 120 22" preserveAspectRatio="none">
            <polyline className="pulse-line" points={wave.points} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            {wave.dotX && <circle className="pulse-dot" cx={wave.dotX} cy="11" r="3"/>}
          </svg>
        </div>
        <span className="rc-heat-label">{heat.label}</span>
      </div>
    </div>
  )
}
