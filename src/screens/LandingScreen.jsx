import { useState } from 'react'
import useStore from '../store/useStore.js'
import { useToast } from '../context/ToastContext.jsx'
import { fetchUser } from '../api/github.js'
import { fetchAllRepos } from '../api/github.js'
import { cleanToken } from '../utils/index.js'

export default function LandingScreen() {
  const [pat, setPat]       = useState('')
  const [loading, setLoading] = useState(false)
  const { setToken, setUser, setAllRepos } = useStore()
  const toast = useToast()

  async function connect() {
    const token = cleanToken(pat)
    if (!token) { toast('⚠️', 'No token', 'Paste your GitHub Personal Access Token first'); return }
    setLoading(true)
    try {
      // Temporarily set token in store for ghFetch to use
      setToken(token)
      const user = await fetchUser()
      if (!user.login) throw new Error('Invalid token response')
      setUser(user)
      setPat('')
      // Pre-fetch repos in background
      fetchAllRepos().then(repos => setAllRepos(repos)).catch(() => {})
    } catch (e) {
      // Rollback token on failure
      setToken('')
      toast('❌', 'Invalid token', e.message || 'Could not verify token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen active" id="screen-landing">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      <div className="landing-card">
        <div className="landing-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" width="32" height="32">
            <circle cx="12" cy="12" r="4"/>
            <line x1="1" y1="12" x2="7" y2="12"/>
            <line x1="17" y1="12" x2="23" y2="12"/>
          </svg>
          <div>
            <h1>Git<span>Digest</span></h1>
            <p>AI-powered repo intelligence</p>
          </div>
        </div>

        <div className="landing-features">
          <div className="lf-item">
            <span className="lf-dot"></span>
            Commit analysis with AI summaries
          </div>
          <div className="lf-item">
            <span className="lf-dot"></span>
            PR review, risk scoring &amp; diff viewer
          </div>
          <div className="lf-item">
            <span className="lf-dot"></span>
            Insights: velocity, contributors, quality trends
          </div>
          <div className="lf-item">
            <span className="lf-dot"></span>
            Issues, branches &amp; client report generator
          </div>
        </div>

        <div className="pat-section">
          <div className="pat-label">GitHub Personal Access Token</div>
          <input
            className="pat-input"
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={pat}
            onChange={e => setPat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
            disabled={loading}
            autoComplete="off"
          />
          <button
            className={`btn btn-primary btn-connect${loading ? ' spinning' : ''}`}
            onClick={connect}
            disabled={loading}
          >
            {loading
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/></svg>
            }
            {loading ? 'Verifying…' : 'Connect with GitHub'}
          </button>
        </div>

        <div className="pat-hint">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          Token needs <strong>repo</strong> and <strong>read:user</strong> scopes. Stored in sessionStorage only — cleared when you close the tab.
          <a href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Git+Digest" target="_blank" rel="noopener">Generate token →</a>
        </div>
      </div>
    </div>
  )
}
