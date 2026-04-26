import useStore from '../../store/useStore.js'

const NAV = [
  {
    view: 'commits', label: 'Commits',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><line x1="1" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="23" y2="12"/></svg>,
  },
  {
    view: 'prs', label: 'Pull Requests',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7M6 9v12"/></svg>,
  },
  {
    view: 'insights', label: 'Insights',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  },
  {
    view: 'issues', label: 'Issues',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  },
  {
    view: 'branches', label: 'Branches',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>,
  },
  {
    view: 'settings', label: 'Settings',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  },
]

export default function Sidebar({ openIssuesCount, alertUnread }) {
  const { currentView, switchView, currentRepo, backToRepos } = useStore()
  const ghUrl = currentRepo ? `https://github.com/${currentRepo.full_name}` : '#'

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Git<span>Digest</span></h1>
        <p>{currentRepo?.full_name || '—'}</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Navigation</div>
        {NAV.map(item => (
          <button
            key={item.view}
            className={`nav-item${currentView === item.view ? ' active' : ''}`}
            data-view={item.view}
            onClick={() => switchView(item.view)}
          >
            {item.icon}
            {item.label}
            {item.view === 'issues' && openIssuesCount > 0 && (
              <span id="nav-issues-count" style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'var(--gold-dim)', color: 'var(--gold)', padding: '1px 6px', borderRadius: 10 }}>
                {openIssuesCount > 99 ? '99+' : openIssuesCount}
              </span>
            )}
            {item.view === 'settings' && alertUnread > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, background: 'var(--teal-dim)', color: 'var(--teal)', padding: '1px 6px', borderRadius: 10 }}>
                {alertUnread > 9 ? '9+' : alertUnread}
              </span>
            )}
          </button>
        ))}

        <div className="nav-label" style={{ marginTop: 24 }}>Repository</div>
        <a
          className="nav-item"
          id="sidebar-repo-link"
          href={ghUrl}
          target="_blank"
          rel="noopener"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View on GitHub
        </a>
        <button className="nav-item" onClick={backToRepos}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Switch Repo
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="live-dot"></div>
        <a id="sidebar-repo-footer" href={ghUrl} target="_blank" rel="noopener">
          {currentRepo?.full_name || 'No repo selected'}
        </a>
      </div>
    </aside>
  )
}
