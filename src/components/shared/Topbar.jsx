import { useState } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'
import { fetchNotifications } from '../../api/github.js'
import { ghWrite } from '../../api/github.js'
import { timeAgo, esc } from '../../utils/index.js'

const VIEW_META = {
  commits:  { title: 'Commits',       badge: 'AI Analysis' },
  prs:      { title: 'Pull Requests', badge: 'Code Review' },
  insights: { title: 'Insights',      badge: 'Analytics' },
  issues:   { title: 'Issues',        badge: 'Tracker' },
  branches: { title: 'Branches',      badge: 'Repo' },
  settings: { title: 'Settings',      badge: 'Config' },
}

export default function Topbar({ onRefresh, refreshing, onOpenReport, onOpenAsk, commits, prs }) {
  const { currentView, currentRepo, toggleTheme, isLight, alertUnread } = useStore()
  const toast = useToast()
  const meta  = VIEW_META[currentView] || { title: currentView, badge: '' }

  const [notifOpen, setNotifOpen]       = useState(false)
  const [notifTab, setNotifTab]         = useState('gh')
  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(false)
  const { alertFeed, markAlertsRead }   = useStore()

  async function openNotifPanel() {
    const next = !notifOpen
    setNotifOpen(next)
    if (next && notifTab === 'gh') loadNotifications()
    if (next && notifTab === 'alerts') markAlertsRead()
  }

  async function loadNotifications() {
    setNotifLoading(true)
    try {
      const items = await fetchNotifications(currentRepo?.full_name)
      setNotifications(items)
    } catch { setNotifications([]) }
    finally { setNotifLoading(false) }
  }

  async function markAllRead() {
    try {
      await ghWrite('PUT', 'https://api.github.com/notifications', {})
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
      toast('✅', 'Cleared', 'All notifications marked as read')
    } catch (e) { toast('❌', 'Failed', e.message) }
  }

  function switchTab(tab) {
    setNotifTab(tab)
    if (tab === 'alerts') markAlertsRead()
    else if (tab === 'gh') loadNotifications()
  }

  const unreadCount = notifications.filter(n => n.unread).length

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title" id="topbar-title">{meta.title}</span>
        {meta.badge && <span className="topbar-badge" id="topbar-badge">{meta.badge}</span>}
      </div>
      <div className="topbar-right" id="topbar-right">
        {/* Refresh */}
        <button
          className={`btn${refreshing ? ' spinning' : ''}`}
          onClick={onRefresh}
          title="Refresh data"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>

        {/* Report */}
        <button className="btn" onClick={onOpenReport} title="Generate client report">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Report
        </button>

        {/* Ask */}
        <button className="btn" onClick={onOpenAsk} title="Ask your repo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Ask
        </button>

        {/* Notifications */}
        <div id="notif-wrap" style={{ position: 'relative' }}>
          <button className="btn" onClick={openNotifPanel} title="Notifications" style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {(unreadCount > 0 || alertUnread > 0) && (
              <span id="notif-badge" style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {Math.min(unreadCount + alertUnread, 9)}{(unreadCount + alertUnread) > 9 ? '+' : ''}
              </span>
            )}
          </button>

          {notifOpen && (
            <div id="notif-panel" className="notif-panel" style={{ display: 'block' }}>
              <div className="notif-header">
                <div className="notif-tabs">
                  <button id="ntab-gh" className={`ntab${notifTab === 'gh' ? ' active' : ''}`} onClick={() => switchTab('gh')}>
                    GitHub
                  </button>
                  <button id="ntab-alerts" className={`ntab${notifTab === 'alerts' ? ' active' : ''}`} onClick={() => switchTab('alerts')}>
                    Alerts
                    {alertUnread > 0 && <span id="ntab-alerts-count" style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, background: 'var(--red)', color: '#fff', padding: '1px 5px', borderRadius: 10 }}>{alertUnread > 9 ? '9+' : alertUnread}</span>}
                  </button>
                </div>
                {notifTab === 'gh' && unreadCount > 0 && (
                  <button style={{ fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }} onClick={markAllRead}>Mark all read</button>
                )}
              </div>

              {notifTab === 'gh' && (
                <div id="notif-list">
                  {notifLoading
                    ? <div className="notif-empty">Loading…</div>
                    : notifications.length === 0
                      ? <div className="notif-empty">No notifications for this repo</div>
                      : notifications.map(n => {
                          const typeIcon = n.subject.type === 'PullRequest' ? '⟵' : n.subject.type === 'Issue' ? '●' : '◆'
                          const num = n.subject.url?.split('/').pop() || ''
                          return (
                            <div key={n.id} className={`notif-item ${n.unread ? 'unread' : 'read'}`}>
                              <div className="notif-title">{typeIcon} {n.subject.title}</div>
                              <div className="notif-sub">{n.subject.type} {num ? '#' + num : ''} · {timeAgo(n.updated_at)}</div>
                            </div>
                          )
                        })
                  }
                </div>
              )}

              {notifTab === 'alerts' && (
                <div id="alert-feed-list">
                  <AlertFeed />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button className="btn" id="theme-btn" onClick={toggleTheme} title="Toggle theme">
          {isLight
            ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg> Dark</>
            : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> Light</>
          }
        </button>
      </div>
    </header>
  )
}

function AlertFeed() {
  const { alertFeed } = useStore()
  if (!alertFeed.length) {
    return <div className="notif-empty">No alerts yet.<br /><span style={{ color: 'var(--text3)' }}>Configure rules in Settings to start monitoring.</span></div>
  }
  const typeColor = { commit: 'var(--blue)', pr: 'var(--gold)', merge: 'var(--teal)', stale: 'var(--amber)' }
  return alertFeed.map(a => (
    <div key={a.id} className={`alert-feed-item ${a.read ? '' : 'unread'}`}>
      <div className="alert-feed-icon" style={{ background: (typeColor[a.type] || 'var(--text3)') + '20', color: typeColor[a.type] || 'var(--text3)' }}>🔔</div>
      <div className="alert-feed-body">
        <div className="alert-feed-title">{a.title}</div>
        <div className="alert-feed-sub">{a.body}</div>
        <div className="alert-feed-time">{timeAgo(a.time)}</div>
      </div>
    </div>
  ))
}
