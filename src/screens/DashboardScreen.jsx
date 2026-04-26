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

const REFRESH_INTERVAL = 2 * 60 * 1000

export default function DashboardScreen() {
  const { currentView, API, alertRules, addAlertFeedItem, alertUnread } = useStore()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [refreshing, setRefreshing]       = useState(false)
  const [refreshBanner, setRefreshBanner] = useState(false)
  const [openIssuesCount, setOpenIssuesCount] = useState(0)
  const [reportOpen, setReportOpen]       = useState(false)
  const [askOpen, setAskOpen]             = useState(false)

  const timerRef = useRef(null)

  const silentRefresh = useCallback(async () => {
    if (!API) return
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commits', API] }),
        queryClient.invalidateQueries({ queryKey: ['prs',     API] }),
        queryClient.invalidateQueries({ queryKey: ['issues',  API] }),
        queryClient.invalidateQueries({ queryKey: ['branches', API] }),
      ])
      evaluateAlertRules()
      setRefreshBanner(true)
    } catch { /* silent */ }
  }, [API, queryClient])

  function evaluateAlertRules() {
    const { commitAnalysisCache } = useStore.getState()
    alertRules.filter(r => r.enabled).forEach(rule => {
      if (rule.metric === 'risk_high') {
        const shas = [...commitAnalysisCache.entries()]
          .filter(([, a]) => a?.risk_level?.startsWith('High'))
          .map(([sha]) => sha.slice(0, 7))
        if (shas.length > 0) {
          addAlertFeedItem({ id: Date.now() + Math.random(), type: 'commit', title: 'High-risk commit detected', body: shas.join(', '), time: new Date().toISOString(), read: false })
          if (Notification.permission === 'granted') new Notification('Git Digest — High Risk Commit', { body: shas.join(', ') })
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
        queryClient.invalidateQueries({ queryKey: ['commits',  API] }),
        queryClient.invalidateQueries({ queryKey: ['prs',      API] }),
        queryClient.invalidateQueries({ queryKey: ['issues',   API] }),
        queryClient.invalidateQueries({ queryKey: ['branches', API] }),
      ])
      toast('✅', 'Refreshed', 'Data updated')
    } catch (e) {
      toast('❌', 'Refresh failed', e.message)
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  return (
    <>
      <Sidebar openIssuesCount={openIssuesCount} alertUnread={alertUnread} />
      <Topbar
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onOpenReport={() => setReportOpen(true)}
        onOpenAsk={() => setAskOpen(true)}
      />
      <main className="main">
        {refreshBanner && (
          <div id="refresh-banner" style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--teal-dim)', border: '1px solid var(--teal)', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--teal)' }}>New activity detected.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleRefresh} style={{ fontSize: 12, color: 'var(--teal)', borderColor: 'var(--teal)' }}>Load updates</button>
              <button onClick={() => setRefreshBanner(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
          </div>
        )}

        {currentView === 'commits'  && <CommitsView onIssueCountChange={setOpenIssuesCount} />}
        {currentView === 'prs'      && <PRsView />}
        {currentView === 'insights' && <InsightsView />}
        {currentView === 'issues'   && <IssuesView onIssueCountChange={setOpenIssuesCount} />}
        {currentView === 'branches' && <BranchesView />}
        {currentView === 'settings' && <SettingsView />}
      </main>

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
      {askOpen    && <AskOverlay  onClose={() => setAskOpen(false)} />}
    </>
  )
}
