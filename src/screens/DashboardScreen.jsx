import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import useStore from '../store/useStore.js'
import { useToast } from '../context/ToastContext.jsx'
import Sidebar from '../components/shared/Sidebar.jsx'
import Topbar  from '../components/shared/Topbar.jsx'
import CommitsView  from '../components/views/CommitsView.jsx'
import PRsView      from '../components/views/PRsView.jsx'
import InsightsView from '../components/views/InsightsView.jsx'
import IssuesView   from '../components/views/IssuesView.jsx'
import BranchesView from '../components/views/BranchesView.jsx'
import SettingsView from '../components/views/SettingsView.jsx'
import ReportModal  from '../components/modals/ReportModal.jsx'
import AskOverlay   from '../components/modals/AskOverlay.jsx'

const REFRESH_INTERVAL = 2 * 60 * 1000 // 2 minutes

export default function DashboardScreen() {
  const { currentView, API, alertRules, addAlertFeedItem, alertUnread } = useStore()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [refreshing, setRefreshing]     = useState(false)
  const [refreshBanner, setRefreshBanner] = useState(false)
  const [openIssuesCount, setOpenIssuesCount] = useState(0)
  const [commitStats, setCommitStats]   = useState({ commits: [], cache: new Map() })
  const [reportOpen, setReportOpen]     = useState(false)
  const [askOpen, setAskOpen]           = useState(false)

  const timerRef = useRef(null)

  const silentRefresh = useCallback(async () => {
    if (!API) return
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commits', API] }),
        queryClient.invalidateQueries({ queryKey: ['prs', API] }),
        queryClient.invalidateQueries({ queryKey: ['issues', API] }),
        queryClient.invalidateQueries({ queryKey: ['branches', API] }),
      ])
      evaluateAlertRules()
      setRefreshBanner(true)
    } catch { /* silent */ }
  }, [API, queryClient])

  function evaluateAlertRules() {
    const { commitAnalysisCache, prAnalysisCache } = useStore.getState()
    alertRules.filter(r => r.enabled).forEach(rule => {
      if (rule.metric === 'risk_high') {
        const highRiskShas = [...commitAnalysisCache.entries()]
          .filter(([, a]) => a?.risk_level?.startsWith('High'))
          .map(([sha]) => sha.slice(0, 7))
        if (highRiskShas.length > 0) {
          addAlertFeedItem({
            id: Date.now() + Math.random(),
            type: 'commit',
            title: `High-risk commit${highRiskShas.length > 1 ? 's' : ''} detected`,
            body: highRiskShas.join(', '),
            time: new Date().toISOString(),
            read: false,
          })
          if (Notification.permission === 'granted') {
            new Notification('Git Digest — High Risk Commit', { body: highRiskShas.join(', ') })
          }
        }
      }
    })
  }

  useEffect(() => {
    timerRef.current = setInterval(silentRefresh, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [silentRefresh])

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshBanner(false)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commits', API] }),
        queryClient.invalidateQueries({ queryKey: ['prs', API] }),
        queryClient.invalidateQueries({ queryKey: ['issues', API] }),
        queryClient.invalidateQueries({ queryKey: ['branches', API] }),
      ])
      toast('✅', 'Refreshed', 'Data updated')
    } catch (e) {
      toast('❌', 'Refresh failed', e.message)
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  function loadUpdates() {
    setRefreshBanner(false)
    handleRefresh()
  }

  return (
    <div id="screen-dashboard" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar openIssuesCount={openIssuesCount} alertUnread={alertUnread} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onOpenReport={() => setReportOpen(true)}
          onOpenAsk={() => setAskOpen(true)}
          commits={commitStats.commits}
        />

        {refreshBanner && (
          <div id="refresh-banner" style={{ background: 'var(--teal-dim)', borderBottom: '1px solid var(--teal)', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--teal)' }}>
            <span>New activity detected.</span>
            <button
              onClick={loadUpdates}
              style={{ background: 'none', border: '1px solid var(--teal)', borderRadius: 'var(--r-btn)', padding: '2px 10px', color: 'var(--teal)', cursor: 'pointer', fontSize: 12 }}
            >
              Load updates
            </button>
            <button
              onClick={() => setRefreshBanner(false)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 16, lineHeight: 1 }}
            >✕</button>
          </div>
        )}

        <main className="main-content" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {currentView === 'commits'  && <CommitsView  onStatsChange={(commits, cache) => setCommitStats({ commits, cache })} />}
          {currentView === 'prs'      && <PRsView />}
          {currentView === 'insights' && <InsightsView />}
          {currentView === 'issues'   && <IssuesView onIssueCountChange={setOpenIssuesCount} />}
          {currentView === 'branches' && <BranchesView />}
          {currentView === 'settings' && <SettingsView />}
        </main>
      </div>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
      {askOpen    && <AskOverlay  onClose={() => setAskOpen(false)} />}
    </div>
  )
}
