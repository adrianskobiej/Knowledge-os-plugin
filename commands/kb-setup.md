---
description: Set up or connect the company knowledge base for someone non-technical — the agent does all the work and asks only 2-3 simple things. Use when the user says e.g. "set up my knowledge base", "install the KB", "connect me to our knowledge base", "get me started with knowledge-os".
allowed-tools: Bash, Read, Write, Edit
---

# /kb-setup — assistant-guided setup (few questions, agent does the rest)

Get the user onto the base with the **fewest questions possible**. You do ALL the technical work; they
answer ~2-3 simple things. Lead, don't quiz.

**What the user actually does (keep it this small):**
- **Joining a company that already has a base:** paste the link → log in once → tell you their name/role. Done.
- **First person / new company:** tell you the company name + language → log in once → name/role. Done.
Everything else — detect, install, clone/create, register, reindex, save — you do silently.

**Conversation rules:** plain language (no "repo/clone/commit" — say "your company's shared base",
"downloading", "saving"); one question at a time; run every command yourself; never show raw errors
(explain in human terms); confirm before creating anything; don't create a new base if one might exist.

---

## Phase 1 — Figure out the situation (mostly silent)
Detect an existing base first — it may be set up in a **different app** (Claude Code / Codex / Antigravity
share one registry):
```bash
node "${CLAUDE_PLUGIN_ROOT}/install.mjs" --list
```
- **A base is already here** → *"You already have **<name>** — I'll connect this app to it."* Run
  `node "${CLAUDE_PLUGIN_ROOT}/install.mjs"`, make sure they have a profile (Phase 3 if not), then open the
  viewer (Phase 4 wrap). They're an existing user — **don't re-onboard**. Done.
  (Running several companies? Also offer: open this one, join a different company [link], or start a new one.)
- **Nothing here** → ask ONE question: *"Did someone send you a link to your company's base, or are we
  starting fresh?"* → has a link (or it's on another machine) = **JOIN**; starting fresh = **NEW**.

## Phase 2 — Get connected (GitHub, hand-held)
The base lives in the company's **own private GitHub repo, under their account/organization**. Install any
missing tools (`node`/`git`/`gh`; macOS `brew install node gh`), then check `gh auth status`:
- logged in → good · has account, not logged in → `gh auth login` (browser) · **no account** → guide them:
  github.com/signup (username, email, verify) + (for a company) a free Organization, then `gh auth login`.
- **JOIN:** download the base into `~/knowledge/<slug>`. If access is blocked, don't show the raw error —
  *"This base is private; ask whoever set it up to invite you to the repo/organization, then tell me."* Retry.
  **Inherit company name, departments and language — don't re-ask.** (Empty folder → it's actually NEW.)
- **NEW:** ask the company name + the writing language (`company.language`, the team default), then
  `gh repo create <their-account-or-org>/<slug>-knowledge --private` and stamp the template
  (`${CLAUDE_PLUGIN_ROOT}/template/`, skip `INDEX.md`/`kb-data.js`). No account & won't make one → create it
  locally for now, connect to GitHub later.
- One company = one repo + one `~/knowledge/<slug>`. Never merge two companies into one base.

## Phase 3 — Make it yours
- **Profile (both):** ask name + role → `people/<handle>.md` from `_templates/person.md` + add their git
  email → handle in `roster` (attribution).
- **NEW only:** set `knowledge.config.json` (`company.name`, `slug`, `company.language`, `version` from
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`); seed `CONTEXT.md` (company, language, 1-2 lines).
- **Save:** `node scripts/reindex.mjs` → `node "${CLAUDE_PLUGIN_ROOT}/install.mjs" --base ~/knowledge/<slug>`
  (registers it so every tool here knows it) → `git add/commit/push` (NEW = first save; JOIN = push your
  profile so the team sees you — rejected push = read-only, ask the admin for write access).

## Phase 4 — Get going (short, optional)
Open the viewer: `open ~/knowledge/<slug>/viewer.html`. Then, **only if they're up for it**, a 1-minute
"get to know you" (skippable, a few questions max):
- NEW (owner): goals · what they're building (offer `/kb-new-project` per project) · this week's focus (`now.md`).
- JOIN (employee): just enrich their own profile (expertise, how they work) — don't touch company `CONTEXT`/`now`.
Then teach ONE thing: *"You don't need commands — just talk to me: ask about anything, say 'save this',
or paste meeting notes. If you ever feel lost, say 'how do I use this?'"* (that's `/kb-help`; the full
command list lives there). `GAPS.md` lists what's left to fill. Congratulate + summarize.
