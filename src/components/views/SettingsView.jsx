import { useState } from 'react'
import useStore from '../../store/useStore.js'
import { useToast } from '../../context/ToastContext.jsx'

const ALERT_METRICS = [
  { value: 'risk_high', label: 'High-risk commit pushed' },
  { value: 'pr_open_days', label: 'PR open > N days' },
  { value: 'stale_branch', label: 'Branch stale > N days' },
  { value: 'no_commit_days', label: 'No commits for N days' },
]

export default function SettingsView() {
  const {
    ghToken, ghUser, currentRepo,
    settings, setSettings,
    alertRules, setAlertRules,
    commitAnalysisCache, prAnalysisCache, commitDetailCache,
    prFilesCache, prReviewsCache, prCommentsCache,
    prReviewCommentsCache, prReviewAICache, prRiskCache,
    clearAllCaches,
  } = useStore()
  const toast = useToast()

  const [keyInput, setKeyInput]   = useState('')
  const [keySaved, setKeySaved]   = useState(!!sessionStorage.getItem('gd_anth_key'))
  const [newRuleMetric, setNewRuleMetric] = useState(ALERT_METRICS[0].value)
  const [newRuleThreshold, setNewRuleThreshold] = useState(3)
  const [notifStatus, setNotifStatus] = useState('')

  const cacheStats = [
    { label: 'Commit analyses', count: commitAnalysisCache.size },
    { label: 'PR analyses',     count: prAnalysisCache.size },
    { label: 'Commit details',  count: commitDetailCache.size },
    { label: 'PR files',        count: prFilesCache.size },
    { label: 'PR reviews',      count: prReviewsCache.size },
    { label: 'PR comments',     count: prCommentsCache.size + prReviewCommentsCache.size },
    { label: 'AI reviews',      count: prReviewAICache.size },
    { label: 'Risk scores',     count: prRiskCache.size },
  ]
  const totalCached = cacheStats.reduce((s, c) => s + c.count, 0)

  function saveKey() {
    const k = keyInput.trim()
    if (!k) { toast('⚠️', 'Empty key', 'Paste your Anthropic API key first'); return }
    sessionStorage.setItem('gd_anth_key', k)
    setKeySaved(true)
    setKeyInput('')
    toast('✅', 'API key saved', 'Key stored for this session')
  }

  function removeKey() {
    sessionStorage.removeItem('gd_anth_key')
    setKeySaved(false)
    toast('🗑️', 'API key removed', 'You can add it again anytime')
  }

  function togglePref(key) {
    setSettings({ ...settings, [key]: !settings[key] })
  }

  function addRule() {
    const rule = { id: Date.now(), metric: newRuleMetric, threshold: Number(newRuleThreshold), enabled: true }
    setAlertRules([...alertRules, rule])
    toast('✅', 'Alert rule added', ALERT_METRICS.find(m => m.value === newRuleMetric)?.label)
  }

  function removeRule(id) {
    setAlertRules(alertRules.filter(r => r.id !== id))
  }

  function toggleRule(id) {
    setAlertRules(alertRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) { setNotifStatus('Not supported in this browser'); return }
    const perm = await Notification.requestPermission()
    setNotifStatus(perm === 'granted' ? 'Notifications enabled ✓' : 'Permission denied')
  }

  const notifPerm = 'Notification' in window ? Notification.permission : 'unavailable'

  return (
    <div className="view active" id="view-settings">

      {/* Anthropic API Key */}
      <section className="settings-section">
        <div className="settings-section-title">Anthropic API Key</div>
        <div className="settings-section-desc">Required for AI commit analysis, PR review, insights, and stale branch detection. Stored in sessionStorage — cleared when you close this tab.</div>
        {keySaved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ API key saved for this session</span>
            <button className="abtn" style={{ fontSize: 11, color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={removeKey}>Remove</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              type="password"
              placeholder="sk-ant-api03-…"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
              style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '9px 12px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
            />
            <button className="btn btn-primary" onClick={saveKey} style={{ fontSize: 12 }}>Save Key</button>
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          Get your key at{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: 'var(--blue)' }}>console.anthropic.com</a>
        </div>
      </section>

      {/* Preferences */}
      <section className="settings-section">
        <div className="settings-section-title">Analysis Preferences</div>
        {[
          { key: 'autoAnalyze',    label: 'Auto-analyze on expand',    desc: 'Automatically run AI analysis when you expand a commit or PR' },
          { key: 'securityScan',   label: 'Security file scanner',     desc: 'Show 🔒 badge when commits touch auth, crypto, or config files' },
          { key: 'showSuggested',  label: 'Suggested commit messages',  desc: 'Show AI-generated improved commit message when the original is vague' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="settings-pref-row" onClick={() => togglePref(key)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>
            </div>
            <div className={`toggle ${settings[key] ? 'on' : ''}`}></div>
          </div>
        ))}
      </section>

      {/* Connected account */}
      <section className="settings-section">
        <div className="settings-section-title">Connected Account</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          {ghUser?.avatar_url
            ? <img src={ghUser.avatar_url} alt="avatar" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border2)' }} />
            : <div className="av" style={{ width: 36, height: 36, fontSize: 14 }}>{(ghUser?.login || '?')[0].toUpperCase()}</div>
          }
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{ghUser?.login || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {ghToken ? `Token: ${ghToken.slice(0, 8)}…` : 'No token'}
            </div>
          </div>
        </div>
        {currentRepo && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--s2)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700 }}>Active repo</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{currentRepo.full_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {currentRepo.private ? '🔒 Private' : '🌐 Public'} · {currentRepo.language || 'Unknown language'} · ★ {currentRepo.stargazers_count}
            </div>
          </div>
        )}
      </section>

      {/* Cache */}
      <section className="settings-section">
        <div className="settings-section-title">
          Analysis Cache
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text3)', fontWeight: 400 }}>{totalCached} item{totalCached !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 10 }}>
          {cacheStats.map(s => (
            <div key={s.label} style={{ padding: '8px 12px', background: 'var(--s2)', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.count > 0 ? 'var(--blue)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>{s.count}</span>
            </div>
          ))}
        </div>
        <button
          className="btn"
          onClick={() => { clearAllCaches(); toast('🗑️', 'Cache cleared', 'All analysis cache cleared') }}
          disabled={totalCached === 0}
          style={{ marginTop: 12, fontSize: 12, color: 'var(--red)', borderColor: 'var(--red-dim)' }}
        >
          Clear all cache
        </button>
      </section>

      {/* Alert rules */}
      <section className="settings-section">
        <div className="settings-section-title">Alert Rules</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          Rules are evaluated during silent refresh (every 2 min). Triggered alerts appear in the notification panel.
        </div>

        {alertRules.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {alertRules.map(rule => {
              const meta = ALERT_METRICS.find(m => m.value === rule.metric)
              const needsN = rule.metric !== 'risk_high'
              return (
                <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className={`toggle ${rule.enabled ? 'on' : ''}`} onClick={() => toggleRule(rule.id)} style={{ cursor: 'pointer' }}></div>
                  <span style={{ flex: 1, fontSize: 12, color: rule.enabled ? 'var(--text)' : 'var(--text3)' }}>
                    {meta?.label}{needsN ? ` (${rule.threshold})` : ''}
                  </span>
                  <button
                    onClick={() => removeRule(rule.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Condition</div>
            <select
              value={newRuleMetric}
              onChange={e => setNewRuleMetric(e.target.value)}
              className="ins-author-sel"
              style={{ width: '100%' }}
            >
              {ALERT_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {newRuleMetric !== 'risk_high' && (
            <div style={{ width: 80 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Threshold</div>
              <input
                type="number"
                min={1}
                value={newRuleThreshold}
                onChange={e => setNewRuleThreshold(e.target.value)}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', padding: '7px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
              />
            </div>
          )}
          <button className="btn btn-primary" onClick={addRule} style={{ fontSize: 12 }}>
            Add Rule
          </button>
        </div>
      </section>

      {/* Browser notifications */}
      <section className="settings-section">
        <div className="settings-section-title">Browser Notifications</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              Status: <span style={{ color: notifPerm === 'granted' ? 'var(--green)' : notifPerm === 'denied' ? 'var(--red)' : 'var(--text3)' }}>
                {notifPerm === 'granted' ? 'Enabled' : notifPerm === 'denied' ? 'Blocked by browser' : notifPerm === 'unavailable' ? 'Not supported' : 'Not yet granted'}
              </span>
            </div>
            {notifStatus && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{notifStatus}</div>}
          </div>
          {notifPerm !== 'granted' && notifPerm !== 'unavailable' && (
            <button className="btn" onClick={requestNotifPermission} style={{ fontSize: 12 }}>
              Enable Notifications
            </button>
          )}
        </div>
      </section>

    </div>
  )
}
