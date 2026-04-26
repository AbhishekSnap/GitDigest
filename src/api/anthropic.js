import { CLAUDE, MODEL, getKey, detectType } from '../utils/index.js'
import { fetchCommitDetail, fetchPRFiles, fetchPRReviews, fetchBranchCommits } from './github.js'
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
  const diffText = files.slice(0, 10).map(f =>
    `=== ${f.filename} (+${f.additions} -${f.deletions}) ===\n${(f.patch || '').slice(0, 500)}`
  ).join('\n\n').slice(0, 5000)

  const prompt = `Review this pull request diff and provide actionable feedback.\n\nDiff:\n${diffText}\n\nReturn a JSON object with:\n  "overview": 2-3 sentence overall assessment\n  "issues": array of objects with "severity" (high|medium|low), "file", "description"\n  "suggestions": array of improvement suggestion strings\n  "verdict": one of: "Approve" | "Request Changes" | "Needs Discussion"\nIMPORTANT: No em dashes, no markdown fences, plain JSON only.`

  const raw    = await claudeCall(key, null, prompt, 2000)
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

  const prompt = `Score the deployment risk of a pull request based on these files changed:\n${fileList}\n\nReturn JSON with:\n  "score": number 1-10 (10 = highest risk)\n  "level": "Low" | "Medium" | "High"\n  "factors": array of risk factor strings (max 5)\n  "recommendation": one sentence action recommendation\nPlain JSON only, no markdown.`

  const raw  = await claudeCall(key, null, prompt, 500)
  const risk = JSON.parse(raw)
  setPRRisk(num, risk)
  return risk
}

// ── Report generation ─────────────────────────────────────────────────────────
export async function generateReport(payload) {
  const key = getKey()
  if (!key) throw new Error('no-key')
  const raw = await claudeCall(key, null, payload, 5500)
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

// ── Stale branch / item analysis ──────────────────────────────────────────────
export async function analyzeStaleItems(branchData, repoName) {
  const key = getKey()
  if (!key) throw new Error('no-key')

  const branchSummary = branchData.slice(0, 20).map(b =>
    `${b.name}: last commit ${b.commit?.commit?.author?.date?.slice(0,10) || 'unknown'}`
  ).join('\n')

  const prompt = `Analyze these branches for a repository (${repoName}) and identify:\n1. Stale branches that should be cleaned up\n2. Active development branches\n3. Potential merge conflicts\n\nBranches:\n${branchSummary}\n\nReturn JSON with:\n  "stale": array of {name, reason} for branches to consider deleting\n  "active": array of branch names that look active\n  "summary": 2-3 sentence overview\nPlain JSON only.`

  const raw = await claudeCall(key, null, prompt, 800)
  return JSON.parse(raw)
}
