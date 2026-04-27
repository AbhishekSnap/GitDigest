import { useState } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'

const RULE_TYPES = [
  { value: 'risk_high',     label: 'High-risk commit detected' },
  { value: 'new_commit',    label: 'Any new commit' },
  { value: 'new_pr',        label: 'Any new PR opened' },
  { value: 'pr_merged',     label: 'Any PR merged' },
  { value: 'pr_stale',      label: 'PR stale for N days' },
  { value: 'author_commit', label: 'New commit by author' },
  { value: 'author_pr',     label: 'New PR by author' },
]
const RULE_HINTS = {
  pr_stale:     'Enter number of days (e.g. 7)',
  author_commit: 'Enter GitHub username',
  author_pr:     'Enter GitHub username',
}

export default function SettingsView() {
  const {
    ghToken, ghUser, currentRepo,
    settings, setSettings,
    alertRules, setAlertRules,
    commitAnalysisCache, prAnalysisCache, commitDetailCache,
    prFilesCache, prReviewsCache, prCommentsCache,
    prReviewCommentsCache, prReviewAICache, prRiskCache,
    clearAllCaches, disconnect, backToRepos,
  } = useStore()
  const toast = useToast()

  const [keyInput, setKeyInput]   = useState('')
  const [keySaved, setKeySaved]   = useState(!!sessionStorage.getItem('gcrmcp_api_key'))
  const [newType, setNewType]     = useState('new_commit')
  const [newParam, setNewParam]   = useState('')

  const cacheTotal = commitAnalysisCache.size + prAnalysisCache.size + commitDetailCache.size +
    prFilesCache.size + prReviewsCache.size + prCommentsCache.size +
    prReviewCommentsCache.size + prReviewAICache.size + prRiskCache.size

  const notifPerm = 'Notification' in window ? Notification.permission : 'unsupported'

  function saveKey() {
    const k = keyInput.trim()
    if (!k) { toast('⚠️', 'Empty key', 'Paste your Anthropic API key first'); return }
    sessionStorage.setItem('gcrmcp_api_key', k)
    setKeySaved(true)
    setKeyInput('')
    toast('✅', 'API key saved', 'Key stored for this session')
  }

  function removeKey() {
    sessionStorage.removeItem('gcrmcp_api_key')
    setKeySaved(false)
    toast('🗑️', 'API key removed', '')
  }

  function addRule() {
    const needsParam = ['pr_stale', 'author_commit', 'author_pr'].includes(newType)
    if (needsParam && !newParam.trim()) {
      toast('⚠️', 'Missing value', RULE_HINTS[newType])
      return
    }
    const rule = { id: Date.now(), type: newType, param: newParam.trim(), enabled: true }
    setAlertRules([...alertRules, rule])
    setNewParam('')
    toast('✅', 'Alert rule added', RULE_TYPES.find(r => r.value === newType)?.label)
  }

  async function requestNotif() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    toast(perm === 'granted' ? '✅' : '❌', 'Notifications', perm === 'granted' ? 'Enabled' : 'Permission denied')
  }

  return (
    <div className="view active" id="view-settings">
      <div className="settings-grid">

        {/* Anthropic API Key */}
        <div className="sc">
          <div className="sc-title">Anthropic API Key</div>
          {keySaved ? (
            <div className="srow">
              <div className="srow-lbl">Key saved for this session ✓</div>
              <button className="abtn" onClick={removeKey} style={{ color: 'var(--red)', borderColor: 'var(--red-dim)', fontSize: 11 }}>Remove</button>
            </div>
          ) : (
            <>
              <input
                type="password"
                className="api-inp"
                placeholder="sk-ant-api03-…"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveKey()}
              />
              <button className="btn btn-primary" onClick={saveKey} style={{ width: '100%', justifyContent: 'center' }}>Save Key</button>
            </>
          )}
          <div className="api-note">
            Key is stored in sessionStorage only. Cleared when the tab closes. Required for AI analysis.
          </div>
        </div>

        {/* Analysis Preferences */}
        <div className="sc">
          <div className="sc-title">Analysis Preferences</div>
          {[
            { key: 'autoAnalyze',   label: 'Auto-analyse on expand',  sub: 'Call Claude when commit is opened' },
            { key: 'securityScan',  label: 'Security scanning',        sub: 'Red badge for auth/security files' },
            { key: 'showSuggested', label: 'Show suggested messages',  sub: 'Display improved commit messages' },
          ].map(({ key, label, sub }) => (
            <div key={key} className="srow" style={{ cursor: 'pointer' }} onClick={() => setSettings({ ...settings, [key]: !settings[key] })}>
              <div>
                <div className="srow-lbl">{label}</div>
                <div className="srow-sub">{sub}</div>
              </div>
              <label className="toggle" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={settings[key]} onChange={() => setSettings({ ...settings, [key]: !settings[key] })} />
                <span className="t-track"></span>
                <span className="t-thumb"></span>
              </label>
            </div>
          ))}
        </div>

        {/* Connected Repository */}
        <div className="sc fw">
          <div className="sc-title">Connected Repository</div>
          <div className="status-row">
            <div className="status-dot"></div>
            {currentRepo?.full_name || '—'} — {currentRepo?.private ? 'Private' : 'Public'}
          </div>
          <div className="srow" style={{ marginTop: 8 }}>
            <div className="srow-lbl">Last fetched</div>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>just now</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn" onClick={backToRepos}>← Switch Repo</button>
            <button className="btn" onClick={disconnect} style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }}>Disconnect GitHub</button>
          </div>
        </div>

        {/* Analysis Cache */}
        <div className="sc fw">
          <div className="sc-title">Analysis Cache</div>
          {[
            ['Cached commit analyses', commitAnalysisCache.size],
            ['Cached PR analyses',     prAnalysisCache.size],
            ['Commit details',         commitDetailCache.size],
            ['PR files/reviews',       prFilesCache.size + prReviewsCache.size],
            ['Comments',               prCommentsCache.size + prReviewCommentsCache.size],
            ['AI reviews & risk',      prReviewAICache.size + prRiskCache.size],
          ].map(([label, count]) => (
            <div key={label} className="srow">
              <div className="srow-lbl">{label}</div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)' }}>{count}</span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => { clearAllCaches(); toast('🗑️', 'Cache cleared', `${cacheTotal} items cleared`) }} disabled={cacheTotal === 0}>
              Clear Analysis Cache
            </button>
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="sc fw">
          <div className="sc-title">Alerts &amp; Notifications</div>

          <div className="srow">
            <div>
              <div className="srow-lbl">Browser Notifications</div>
              <div className="srow-sub">OS-level alerts when the tab is in the background</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`perm-status ${notifPerm === 'granted' ? 'perm-granted' : notifPerm === 'denied' ? 'perm-denied' : 'perm-default'}`}>
                {notifPerm === 'granted' ? 'Enabled' : notifPerm === 'denied' ? 'Blocked' : notifPerm === 'unsupported' ? 'Not supported' : 'Not requested'}
              </span>
              {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
                <button className="btn" onClick={requestNotif} style={{ fontSize: 12 }}>Enable</button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>Alert Rules</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
              Rules are evaluated on every 2-minute auto-refresh. Alerts appear as OS notifications, in-app toasts, and in the Alerts feed.
            </div>

            <div id="alert-rules-list">
              {alertRules.map(rule => {
                const meta = RULE_TYPES.find(r => r.value === rule.type)
                const needsParam = ['pr_stale', 'author_commit', 'author_pr'].includes(rule.type)
                return (
                  <div key={rule.id} className="rule-item">
                    <label className="toggle" style={{ flexShrink: 0 }}>
                      <input type="checkbox" checked={rule.enabled} onChange={() => setAlertRules(alertRules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))} />
                      <span className="t-track"></span>
                      <span className="t-thumb"></span>
                    </label>
                    <div className="rule-label">
                      <span className="rule-type-badge">{meta?.label}</span>
                      {needsParam && rule.param && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>— {rule.param}</span>}
                    </div>
                    <button
                      onClick={() => setAlertRules(alertRules.filter(r => r.id !== rule.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                    >✕</button>
                  </div>
                )
              })}
            </div>

            <div className="rule-builder">
              <select id="new-rule-type" className="rule-select" value={newType} onChange={e => { setNewType(e.target.value); setNewParam('') }}>
                {RULE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {['pr_stale', 'author_commit', 'author_pr'].includes(newType) && (
                <input
                  id="new-rule-param"
                  className="rule-param-inp"
                  placeholder={RULE_HINTS[newType] || ''}
                  value={newParam}
                  onChange={e => setNewParam(e.target.value)}
                />
              )}
              <button className="btn btn-primary" onClick={addRule} style={{ fontSize: 12 }}>+ Add Rule</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
