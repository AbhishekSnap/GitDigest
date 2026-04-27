import { create } from 'zustand'

const GH_API = 'https://api.github.com'

function cleanToken(s) {
  return (s || '').replace(/[^\x20-\x7E]/g, '').trim()
}

const useStore = create((set, get) => ({
  // ── Auth
  ghToken: cleanToken(sessionStorage.getItem('gd_gh_token') || ''),
  ghUser: null,

  // ── Repo state
  currentRepo: null,
  allRepos: [],
  API: '',

  // ── UI state
  currentView: 'commits',
  previousView: 'commits',
  currentBranch: '',
  isLight: localStorage.getItem('gd_theme') === 'light',

  // ── Settings
  settings: { autoAnalyze: true, securityScan: true, showSuggested: true },

  // ── AI analysis caches (Map objects stored in state)
  commitAnalysisCache: new Map(),
  prAnalysisCache: new Map(),
  commitDetailCache: new Map(),
  prFilesCache: new Map(),
  prReviewsCache: new Map(),
  prCommentsCache: new Map(),
  prReviewCommentsCache: new Map(),
  prReviewAICache: new Map(),
  prRiskCache: new Map(),

  // ── Alerts
  alertRules: JSON.parse(localStorage.getItem('gd_alert_rules') || '[]'),
  alertFeed: [],
  alertUnread: 0,

  // ── Actions: Auth
  setToken: (token) => {
    sessionStorage.setItem('gd_gh_token', token)
    set({ ghToken: token })
  },

  setUser: (user) => set({ ghUser: user }),

  disconnect: () => {
    sessionStorage.removeItem('gd_gh_token')
    set({
      ghToken: '', ghUser: null, currentRepo: null, allRepos: [], API: '',
      currentView: 'commits', currentBranch: '',
      commitAnalysisCache: new Map(), prAnalysisCache: new Map(),
      commitDetailCache: new Map(), prFilesCache: new Map(),
      prReviewsCache: new Map(), prCommentsCache: new Map(),
      prReviewCommentsCache: new Map(), prReviewAICache: new Map(),
      prRiskCache: new Map(),
    })
  },

  setAllRepos: (repos) => set({ allRepos: repos }),

  // ── Actions: Repo
  selectRepo: (repo) => {
    const recent = JSON.parse(localStorage.getItem('gd_recent_repos') || '[]')
      .filter(k => k !== repo.full_name)
    recent.unshift(repo.full_name)
    localStorage.setItem('gd_recent_repos', JSON.stringify(recent.slice(0, 3)))
    set({
      currentRepo: repo,
      API: `${GH_API}/repos/${repo.full_name}`,
      currentView: 'commits',
      currentBranch: '',
      commitAnalysisCache: new Map(), prAnalysisCache: new Map(),
      commitDetailCache: new Map(), prFilesCache: new Map(),
      prReviewsCache: new Map(), prCommentsCache: new Map(),
      prReviewCommentsCache: new Map(), prReviewAICache: new Map(),
      prRiskCache: new Map(),
    })
  },

  backToRepos: () => set({ currentRepo: null, API: '', currentView: 'commits', currentBranch: '' }),

  // ── Actions: Navigation
  switchView: (view) => set((state) => ({
    previousView: state.currentView,
    currentView: view,
  })),

  setCurrentBranch: (branch) => set({ currentBranch: branch }),

  // ── Actions: Settings
  setSettings: (settings) => set({ settings }),

  // ── Actions: Theme
  toggleTheme: () => {
    const isLight = !get().isLight
    localStorage.setItem('gd_theme', isLight ? 'light' : 'dark')
    document.documentElement.classList.toggle('light', isLight)
    set({ isLight })
  },

  // ── Actions: Cache mutations
  setCommitAnalysis: (sha, analysis) => set((state) => {
    const cache = new Map(state.commitAnalysisCache)
    cache.set(sha, analysis)
    return { commitAnalysisCache: cache }
  }),

  setPRAnalysis: (num, analysis) => set((state) => {
    const cache = new Map(state.prAnalysisCache)
    cache.set(num, analysis)
    return { prAnalysisCache: cache }
  }),

  setCommitDetail: (sha, detail) => set((state) => {
    const cache = new Map(state.commitDetailCache)
    cache.set(sha, detail)
    return { commitDetailCache: cache }
  }),

  setPRFiles: (num, files) => set((state) => {
    const cache = new Map(state.prFilesCache)
    cache.set(num, files)
    return { prFilesCache: cache }
  }),

  setPRReviews: (num, reviews) => set((state) => {
    const cache = new Map(state.prReviewsCache)
    cache.set(num, reviews)
    return { prReviewsCache: cache }
  }),

  setPRComments: (num, comments) => set((state) => {
    const cache = new Map(state.prCommentsCache)
    cache.set(num, comments)
    return { prCommentsCache: cache }
  }),

  setPRReviewComments: (num, comments) => set((state) => {
    const cache = new Map(state.prReviewCommentsCache)
    cache.set(num, comments)
    return { prReviewCommentsCache: cache }
  }),

  setPRReviewAI: (num, review) => set((state) => {
    const cache = new Map(state.prReviewAICache)
    cache.set(num, review)
    return { prReviewAICache: cache }
  }),

  setPRRisk: (num, risk) => set((state) => {
    const cache = new Map(state.prRiskCache)
    cache.set(num, risk)
    return { prRiskCache: cache }
  }),

  clearAllCaches: () => set({
    commitAnalysisCache: new Map(), prAnalysisCache: new Map(),
    commitDetailCache: new Map(), prFilesCache: new Map(),
    prReviewsCache: new Map(), prCommentsCache: new Map(),
    prReviewCommentsCache: new Map(), prReviewAICache: new Map(),
    prRiskCache: new Map(),
  }),

  // ── Actions: Alerts
  setAlertRules: (rules) => {
    localStorage.setItem('gd_alert_rules', JSON.stringify(rules))
    set({ alertRules: rules })
  },

  addAlertFeedItem: (item) => set((state) => {
    const feed = [item, ...state.alertFeed].slice(0, 30)
    return { alertFeed: feed, alertUnread: feed.filter(a => !a.read).length }
  }),

  markAlertsRead: () => set((state) => ({
    alertFeed: state.alertFeed.map(a => ({ ...a, read: true })),
    alertUnread: 0,
  })),
}))

export default useStore
