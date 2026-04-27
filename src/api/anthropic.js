import { CLAUDE, MODEL, getKey, detectType } from '../utils/index.js'
import { fetchCommitDetail, fetchPRFiles, fetchPRReviews, fetchBranchCommits, ghFetch } from './github.js'
import useStore from '../store/useStore.js'

async function claudeCall(key, system, userMsg, maxTokens = 1500) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  const body = system
    ? { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }] }
    : { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: userMsg }] }
  const res = await fetch(CLAUDE, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error?.message || 'Claude API error ' + res.status)
  }
  const data = await res.json()
  let raw = data.content[0].text.trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1, -1).join('\n').trim()
  return raw
}

// ── Commit analysis ───────────────────────────────────────────────────────────
export async function analyzeCommit(API, sha) {
  const { commitAnalysisCache, setCommitAnalysis } = useStore.getState()
  if (commitAnalysisCache.has(sha)) return commitAnalysisCache.get(sha)

  const key = getKey()
  if (!key) throw new Error('no-key')

  const detail = await fetchCommitDetail(API, sha)
  const files  = (detail.files || []).slice(0, 20)
  const diff   = files.map(f => (f.patch || '').slice(0, 300)).join('\n').slice(0, 3000)

  const msg = `Commit SHA: ${sha.slice(0, 7)}\nMessage: ${detail.commit.message}\nAuthor: ${detail.commit.author.name}\nDate: ${detail.commit.author.date}\nFiles changed: ${files.length}\n${files.map(f => `${f.filename}: +${f.additions} -${f.deletions}`).join('\n')}\n\nDiff (first 3000 chars):\n${diff}`

  const sys = `You are a senior software engineer reviewing a git commit.\nAnalyse the provided commit data and return a JSON object with exactly these six keys:\n  "plain_summary": 2-3 sentence plain-English description of what changed (non-technical, suitable for a project manager)\n  "technical_summary": detailed per-file technical breakdown for a code reviewer who has the diff open. For EACH file changed, produce a section using this exact structure: "filename.py\\n- FunctionOrClass: what specifically changed, new parameters, altered logic, removed behaviour, etc.\\n- ..." Reference exact function names, class names, decorators, and constants. Be precise.\n  "change_type": exactly one of: Bug Fix | Feature | Refactor | Chore | Docs | Tests | Performance | Security\n  "quality": one-line starting with "Good" or "Needs improvement", colon, short reason. Example: "Good: clear scope and clean diff"\n  "risk_level": one of: Low | Medium | High, colon, one-line reason. Example: "Medium: touches auth logic"\n  "suggested_message": return original if clear and follows conventional commits; otherwise return improved type(scope): description\nIMPORTANT: Do NOT use em dashes, en dashes, ellipsis characters, bullet symbols, or any non-ASCII punctuation. Use plain colons, hyphens, and commas instead.\nReturn ONLY valid JSON. No markdown fences, no extra text.`

  const raw      = await claudeCall(key, sys, msg)
  const analysis = JSON.parse(raw)
  setCommitAnalysis(sha, analysis)
  return analysis
}

// ── PR analysis ───────────────────────────────────────────────────────────────
export async function analyzePR(API, num, pr) {
  const { prAnalysisCache, setPRAnalysis } = useStore.getState()
  if (prAnalysisCache.has(num)) return prAnalysisCache.get(num)

  const key = getKey()
  if (!key) throw new Error('no-key')

  const [files, reviews] = await Promise.all([fetchPRFiles(API, num), fetchPRReviews(API, num)])

  const msg = `PR #${num}: ${pr.title}\nAuthor: ${pr.user.login}\nBase: ${pr.base.ref}\nHead: ${pr.head.ref}\nDescription: ${pr.body || 'No description provided'}\nCommits: ${pr.commits || '?'}\nFiles changed: ${files.length}\n${files.map(f => `${f.filename}: +${f.additions} -${f.deletions}`).join('\n')}\nReviews:\n${reviews.map(r => `${r.user.login}: ${r.state}`).join('\n') || 'No reviews yet'}`

  const sys = `You are a senior software engineer reviewing a GitHub pull request.\nReturn a JSON object with exactly four keys:\n  "summary": 2-3 sentence plain-English description suitable for a non-technical stakeholder.\n  "technical_impact": per-file breakdown. For EACH file: "filename.py\\n- FunctionOrClass: what changed". Be precise.\n  "review_sentiment": one of: Approved | Changes Requested | Mixed | No Reviews Yet, colon, one-line summary. Example: "Approved: two reviewers approved with no outstanding comments"\n  "quality": starts with "Good" or "Needs improvement", colon, short reason. Example: "Good: well-scoped with clear description"\nIMPORTANT: Do NOT use em dashes, en dashes, ellipsis characters, bullet symbols, or any non-ASCII punctuation. Use plain colons, hyphens, and commas instead.\nReturn ONLY valid JSON. No markdown fences, no extra text.`

  const raw      = await claudeCall(key, sys, msg)
  const analysis = JSON.parse(raw)
  setPRAnalysis(num, analysis)
  return analysis
}

// ── AI PR review (diff-based) ─────────────────────────────────────────────────
export async function reviewPRDiff(API, num) {
  const { prReviewAICache, setPRReviewAI, prFilesCache } = useStore.getState()
  if (prReviewAICache.has(num)) return prReviewAICache.get(num)

  const key = getKey()
  if (!key) throw new Error('no-key')

  const files = prFilesCache.get(num) || await fetchPRFiles(API, num)
  const patches = files.slice(0, 10).map(f =>
    `File: ${f.filename} (+${f.additions} -${f.deletions})\n${(f.patch || '').slice(0, 500)}`
  ).join('\n\n---\n\n').slice(0, 4000)

  const prompt = `Review this PR diff and identify specific code concerns.\n\nDiff:\n${patches}\n\nReturn JSON with:\n"issues": array of up to 7 objects, each: {"severity":"critical"|"warning"|"info","file":"filename","description":"1-2 sentences naming exact code construct or pattern"}\n"summary": 1-2 sentence overall verdict\nRules: No em dashes, no markdown. Return ONLY valid JSON.`

  const raw    = await claudeCall(key, null, prompt, 900)
  const review = JSON.parse(raw)
  setPRReviewAI(num, review)
  return review
}

// ── Risk scoring ──────────────────────────────────────────────────────────────
export async function scorePRRisk(API, num) {
  const { prRiskCache, setPRRisk, prFilesCache } = useStore.getState()
  if (prRiskCache.has(num)) return prRiskCache.get(num)

  const key = getKey()
  if (!key) throw new Error('no-key')

  const files = prFilesCache.get(num) || await fetchPRFiles(API, num)
  const fileList = files.map(f => `${f.filename}: +${f.additions} -${f.deletions}`).join('\n')

  const hasTests = files.some(f => /test|spec|__tests__/i.test(f.filename))
  const prompt = `Score this pull request's deployment risk across 4 dimensions.\nFiles changed: ${files.length}, Has test files: ${hasTests}\nFile list:\n${fileList}\n\nReturn JSON with:\n"overall": 1-10 (1=very low risk, 10=very high risk)\n"test_coverage": 1-10 (1=well tested, 10=no tests)\n"breaking_changes": 1-10 (1=no breaking changes, 10=high risk)\n"security_risk": 1-10 (1=no concerns, 10=high security risk)\n"deployment_impact": 1-10 (1=minimal impact, 10=high impact)\n"rationale": 1-2 sentence explanation\nReturn ONLY valid JSON.`

  const raw  = await claudeCall(key, null, prompt, 350)
  const risk = JSON.parse(raw)
  setPRRisk(num, risk)
  return risk
}

// ── Report generation ─────────────────────────────────────────────────────────
export async function generateReport(promptStr) {
  const key = getKey()
  if (!key) throw new Error('no-key')
  const raw = await claudeCall(key, null, promptStr, 5500)
  return JSON.parse(raw)
}

// ── Onboarding / project overview ────────────────────────────────────────────
export async function generateOnboarding(repo, commits, prs) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const recentCommits = commits.slice(0, 30).map(c =>
    `${c.commit.author.date.slice(0, 10)} | ${c.commit.author.name} | ${detectType(c.commit.message)} | ${c.commit.message.split('\n')[0].slice(0, 80)}`
  ).join('\n')

  const prompt = `Generate a project overview for: ${repo.full_name}\nDescription: ${repo.description || 'None'}\nLanguage: ${repo.language || 'Unknown'}\nStars: ${repo.stargazers_count}\n\nRecent commits:\n${recentCommits}\n\nReturn JSON with:\n  "summary": 3-4 sentence project overview\n  "tech_stack": array of technology strings\n  "key_areas": array of {area, description} objects (top 5 areas of activity)\n  "team": array of contributor names from commits\n  "health": "Healthy" | "Active" | "Stale" based on commit recency\nPlain JSON only.`

  const raw = await claudeCall(key, null, prompt, 1000)
  return JSON.parse(raw)
}

// ── Ask your repo ─────────────────────────────────────────────────────────────
export async function submitAskQuery(question, repo, commits, prs) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const ctx = [
    `Repository: ${repo?.full_name || 'unknown'}`,
    `Recent commits (newest first):\n${commits.slice(0, 50).map(c => `${c.commit.author.date.slice(0,10)} | ${c.commit.author.name} | ${c.commit.message.split('\n')[0]}`).join('\n')}`,
    `PRs:\n${prs.slice(0, 30).map(p => `#${p.number} ${p.state} | ${p.user.login} | ${p.title}`).join('\n')}`,
  ].join('\n\n')

  const prompt = `You are a code intelligence assistant. Answer the following question about a GitHub repository based on the data provided.\n\n${ctx}\n\nQuestion: ${question}\n\nProvide a clear, concise answer. Use markdown formatting for readability. Be specific and reference actual data from the repository.`

  const key2 = getKey()
  const res = await fetch(CLAUDE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key2,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error('Claude API error')
  const data = await res.json()
  return data.content[0].text
}

// ── AI draft PR title ─────────────────────────────────────────────────────────
export async function draftPRTitle(API, head, base) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const commits = await fetchBranchCommits(API, head)
  const recentCommits = commits.map(c => `- ${c.commit.message.split('\n')[0]}`).join('\n')

  const prompt = `Write a concise pull request title (under 72 characters) for a PR merging "${head}" into "${base}". Commits on this branch:\n${recentCommits || 'None'}\n\nReturn ONLY the title, no quotes, no explanation.`

  const res = await fetch(CLAUDE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 60, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.content[0].text.trim().replace(/^["']|["']$/g, '')
}

// ── AI draft PR description ───────────────────────────────────────────────────
export async function draftPRDescription(API, head, base) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const commits = await fetchBranchCommits(API, head)
  const recentCommits = commits.map(c => `- ${c.commit.message.split('\n')[0]}`).join('\n')

  const prompt = `Write a clear pull request description for a PR merging "${head}" into "${base}".\n\nCommits:\n${recentCommits || 'None'}\n\nWrite 2-4 paragraphs covering: what changed, why, and testing notes. Plain text, no markdown headers.`

  const res = await fetch(CLAUDE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.content[0].text.trim()
}

// ── Stale branch / AI branch analysis (matches original index.html exactly) ────
export async function analyzeStaleItems(branchData, prs, commits, defaultBranch, repoFullName) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const branchSummary = branchData.slice(0, 20).map(b =>
    `${b.name}: ${b.ageDays || 0}d old, ${b.ahead} ahead, ${b.behind} behind${b.pr ? ' (has PR)' : ''}${!b.isDefault && (b.ageDays || 0) > 60 ? ' [STALE]' : ''}`
  ).join('\n')

  const prSummary = prs.map(p =>
    `#${p.number} "${p.title}" by ${p.user?.login || ''} — ${p.state} — opened ${Math.floor((Date.now() - new Date(p.created_at)) / 86400000)}d ago${p.merged_at ? ' merged' : ''}`
  ).join('\n')

  const typeBreakdown = {}
  commits.forEach(c => { const t = detectType(c.commit.message); typeBreakdown[t] = (typeBreakdown[t] || 0) + 1 })

  const longRunning = prs.filter(p => p.state === 'open' && (Date.now() - new Date(p.created_at)) > 14 * 86400000).length

  const prompt = `Analyse this repository's branch health and development patterns.\n\nRepo: ${repoFullName}\nDefault branch: ${defaultBranch}\nTotal branches: ${branchData.length}\nStale branches (30d+): ${branchData.filter(b => !b.isDefault && (b.ageDays || 0) > 30).length}\nLong-running open PRs (14d+): ${longRunning}\n\nBranches:\n${branchSummary || 'None'}\n\nAll PRs:\n${prSummary || 'None'}\n\nCommit type mix: ${Object.entries(typeBreakdown).map(([t, n]) => `${t}:${n}`).join(', ')}\n\nReturn JSON with:\n"stale_branches": array of objects {"name":"branch name","concern":"1 sentence","severity":"high"|"med"|"low"}\n"long_prs": array of objects {"number":N,"title":"short title","concern":"1 sentence","severity":"high"|"med"|"low"}\n"activity_insights": array of 2-3 strings about patterns or risks\n"recommendations": array of 3 actionable strings for the team\nOnly flag actual problems. Return ONLY valid JSON.`

  const raw = await claudeCall(key, null, prompt, 800)
  return JSON.parse(raw)
}

// ── Project Overview / Onboarding (matches original index.html exactly) ────────
export async function generateProjectOverview(API, currentRepo, onProgress) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  // Fetch ALL commits (all pages)
  let allCommits = [], page = 1, hasMore = true
  while (hasMore) {
    onProgress?.(`Fetching commits (${allCommits.length} so far)…`)
    const batch = await ghFetch(`${API}/commits?per_page=100&page=${page}`)
    allCommits = allCommits.concat(batch)
    hasMore = batch.length === 100
    page++
  }

  // Fetch ALL PRs
  let allPRs = [], prPage = 1, prMore = true
  while (prMore) {
    const batch = await ghFetch(`${API}/pulls?state=all&per_page=100&page=${prPage}`)
    allPRs = allPRs.concat(batch)
    prMore = batch.length === 100
    prPage++
  }

  onProgress?.('Analysing with Claude…')

  const typeBreakdown = {}
  allCommits.forEach(c => { const t = detectType(c.commit.message); typeBreakdown[t] = (typeBreakdown[t] || 0) + 1 })
  const authors = [...new Set(allCommits.map(c => c.commit.author.name))].join(', ')

  const chronoAll = [...allCommits].reverse()
  const fullCommitLog = chronoAll.map(c =>
    `${c.commit.author.date.slice(0, 10)} | ${c.commit.author.name} | ${detectType(c.commit.message)} | ${c.commit.message.split('\n')[0].slice(0, 90)}`
  ).join('\n')

  const prLog = allPRs.map(p =>
    `${p.created_at.slice(0, 10)} | ${p.user?.login || ''} | PR #${p.number} | ${p.title} | ${p.merged_at ? 'merged' : p.state}`
  ).join('\n')

  const { commitDetailCache, prFilesCache } = useStore.getState()
  const filesSeen = new Set()
  commitDetailCache.forEach(d => (d.files || []).forEach(f => filesSeen.add(f.filename)))
  prFilesCache.forEach(files => files.forEach(f => filesSeen.add(f.filename)))

  const prompt = `Generate a structured project overview for onboarding a new developer. You have the FULL commit and PR history.\n\nRepo: ${currentRepo?.full_name}\nLanguage: ${currentRepo?.language || 'Unknown'}\nDescription: ${currentRepo?.description || 'None'}\nTotal commits: ${allCommits.length}\nTotal PRs: ${allPRs.length}\nContributors: ${authors}\nCommit types: ${Object.entries(typeBreakdown).map(([t, n]) => `${t}:${n}`).join(', ')}\n\nFULL COMMIT HISTORY (oldest first): DATE | AUTHOR | TYPE | MESSAGE\n${fullCommitLog || 'None'}\n\nFULL PR HISTORY (newest first): DATE | AUTHOR | PR# | TITLE | STATUS\n${prLog || 'None'}\n\nFiles seen in diffs: ${[...filesSeen].slice(0, 40).join(', ') || 'None'}\n\nReturn JSON with:\n"project_type": 2-3 sentences on what this project is, its purpose, and who uses it. Be specific based on the commit and PR history.\n"tech_stack": array of strings (technologies/frameworks detected from files and commit messages)\n"key_modules": array of strings (main functional areas inferred from file paths and history)\n"team_structure": 2-3 sentences on team size, contribution patterns, key contributors and their focus areas\n"evolution": 2-3 sentences describing how the project evolved from its earliest commits to now — what was built first, what came later\n"recent_focus": array of 4-5 strings describing what the team has been working on in the most recent commits/PRs\n"onboarding_tips": array of 4-5 actionable strings for a new developer joining this project\n"health_snapshot": 2-3 sentences on codebase health — commit frequency, PR merge rate, activity trends\nReturn ONLY valid JSON. No em dashes.`

  const raw = await claudeCall(key, null, prompt, 1500)
  return JSON.parse(raw)
}
