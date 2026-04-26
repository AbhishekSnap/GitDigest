import useStore from '../store/useStore.js'

export const GH_API = 'https://api.github.com'

export async function ghFetch(url, accept, token) {
  const ghToken = token ?? useStore.getState().ghToken
  const h = { 'Accept': accept || 'application/vnd.github+json' }
  if (ghToken) h['Authorization'] = 'Bearer ' + ghToken
  const r = await fetch(url, { headers: h })
  if (r.status === 401) {
    useStore.getState().disconnect()
    throw new Error('auth-error')
  }
  if (r.status === 403 || r.status === 429) throw new Error('rate-limit')
  if (r.status === 404) throw new Error('not-found')
  if (r.status === 410) throw new Error('gone')
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

export async function ghWrite(method, url, body) {
  const ghToken = useStore.getState().ghToken
  const h = {
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (ghToken) h['Authorization'] = 'Bearer ' + ghToken
  const r = await fetch(url, { method, headers: h, body: JSON.stringify(body) })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    const detail = json.errors?.map(e => e.message || e.code).join(', ') || ''
    throw new Error((json.message || 'HTTP ' + r.status) + (detail ? ': ' + detail : ''))
  }
  return json
}

// ── Repo listing ──────────────────────────────────────────────────────────────
export async function fetchAllRepos() {
  let page = 1, fetched = []
  while (true) {
    const batch = await ghFetch(
      `${GH_API}/user/repos?sort=pushed&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`
    )
    fetched = fetched.concat(batch)
    if (batch.length < 100) break
    page++
  }
  return fetched
}

// ── Commits ───────────────────────────────────────────────────────────────────
export const PAGE_SIZE_COMMITS = 50
export const PAGE_SIZE_PRS = 20

export async function fetchCommitsPage(API, page, branch) {
  const q = branch ? `&sha=${encodeURIComponent(branch)}` : ''
  return ghFetch(`${API}/commits?per_page=${PAGE_SIZE_COMMITS}&page=${page}${q}`)
}

export async function fetchCommitDetail(API, sha) {
  const cache = useStore.getState().commitDetailCache
  if (cache.has(sha)) return cache.get(sha)
  const d = await ghFetch(`${API}/commits/${sha}`)
  useStore.getState().setCommitDetail(sha, d)
  return d
}

// ── PRs ───────────────────────────────────────────────────────────────────────
export async function fetchPRsPage(API, page) {
  return ghFetch(`${API}/pulls?state=all&per_page=${PAGE_SIZE_PRS}&page=${page}`)
}

export async function fetchPRFiles(API, num) {
  const cache = useStore.getState().prFilesCache
  if (cache.has(num)) return cache.get(num)
  const d = await ghFetch(`${API}/pulls/${num}/files`)
  useStore.getState().setPRFiles(num, d)
  return d
}

export async function fetchPRReviews(API, num) {
  const cache = useStore.getState().prReviewsCache
  if (cache.has(num)) return cache.get(num)
  const d = await ghFetch(`${API}/pulls/${num}/reviews`)
  useStore.getState().setPRReviews(num, d)
  return d
}

export async function fetchPRComments(API, num) {
  const cache = useStore.getState().prCommentsCache
  if (cache.has(num)) return cache.get(num)
  const d = await ghFetch(`${API}/issues/${num}/comments`)
  useStore.getState().setPRComments(num, d)
  return d
}

export async function fetchPRReviewComments(API, num) {
  const cache = useStore.getState().prReviewCommentsCache
  if (cache.has(num)) return cache.get(num)
  const d = await ghFetch(`${API}/pulls/${num}/comments`)
  useStore.getState().setPRReviewComments(num, d)
  return d
}

// ── Issues ────────────────────────────────────────────────────────────────────
export async function fetchIssues(API, state = 'open') {
  const data = await ghFetch(`${API}/issues?state=${state}&per_page=50&direction=desc`)
  return data.filter(i => !i.pull_request)
}

// ── Branches ──────────────────────────────────────────────────────────────────
export async function fetchBranches(API) {
  return ghFetch(`${API}/branches?per_page=100`)
}

// ── CI / Check runs ───────────────────────────────────────────────────────────
export async function fetchCI(API, sha) {
  try {
    const data = await ghFetch(`${API}/commits/${sha}/check-runs`)
    const runs = data.check_runs || []
    if (!runs.length) return 'none'
    if (runs.every(r => r.conclusion === 'success')) return 'pass'
    if (runs.some(r => r.conclusion === 'failure' || r.conclusion === 'timed_out')) return 'fail'
    return 'pending'
  } catch { return 'none' }
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function fetchNotifications(repoFullName) {
  const all = await ghFetch(`${GH_API}/notifications?all=false&per_page=30`)
  return repoFullName ? all.filter(n => n.repository?.full_name === repoFullName) : all.slice(0, 20)
}

// ── User ──────────────────────────────────────────────────────────────────────
export async function fetchUser() {
  return ghFetch(`${GH_API}/user`)
}

// ── Branch commits for PR title drafting ──────────────────────────────────────
export async function fetchBranchCommits(API, branch) {
  return ghFetch(`${API}/commits?sha=${encodeURIComponent(branch)}&per_page=15`).catch(() => [])
}

// ── All commits + PRs for insights ───────────────────────────────────────────
export async function fetchAllCommits(API) {
  let ac = [], page = 1, more = true
  while (more) {
    const b = await ghFetch(`${API}/commits?per_page=100&page=${page}`)
    ac = ac.concat(b); more = b.length === 100; page++
  }
  return ac
}

export async function fetchAllPRs(API) {
  let ap = [], page = 1, more = true
  while (more) {
    const b = await ghFetch(`${API}/pulls?state=all&per_page=100&page=${page}`)
    ap = ap.concat(b); more = b.length === 100; page++
  }
  return ap
}
