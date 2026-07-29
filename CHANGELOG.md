# Changelog

## 0.35.0

- **The capture loop stops depending on good intentions.** A base only beats a memoryless chat if
  things actually reach it, and until now the whole mechanism was one paragraph of prose asking the
  agent to save what it learned. Prose loses: the rule lived in the base's own `AGENTS.md`, which a
  session working in a *project* never loads, and even where it was loaded it had scrolled thousands
  of tokens out of attention by the time the session had anything worth keeping. Three layers now
  back it up, deliberately redundant — each catches what the one before it missed.
- **Layer 1 — the rule travels.** The managed block `install.mjs` writes into every tool's global
  instruction file carries the capture rule itself, not just "a base exists, here is where". It is
  four sentences: save durable knowledge the moment it appears rather than at a stopping point that
  may never come, and an explicit list of what does *not* belong (the task's own steps, anything git
  already records, whatever is only true today). Short on purpose — this text is paid for at the
  start of every session in every project.
- **Layer 2 — `kb-capture-nudge` (UserPromptSubmit).** Re-states the rule mid-session, but only when
  warranted: the session is long enough to have produced something durable *and* has written nothing
  into a base. A session that is already capturing is never interrupted; a short one is not either.
  It then repeats on a cadence rather than every turn, so a session with genuinely nothing to save
  is nudged a few times, not fifty.
- **Layer 3 — `kb-session-capture` (SessionEnd).** Assumes the first two failed. When a substantive
  session ends having saved nothing, the raw material — the prompts, the files touched — is spooled
  to `<base>/_pending/`, and the first prompt of the next session reports the backlog. This layer
  deliberately does not write knowledge: a spool is undistilled material to be turned into an article
  and deleted, or deleted unread. `_pending/` is skipped by reindex and stays outside the `.gitignore`
  whitelist, so raw transcripts of one person's sessions never reach the index, the viewer, or a
  teammate's clone.
- **Duplication is designed out.** Every layer keys off the same fact — whether the session has
  written into a base. That is what makes redundancy safe: layers 2 and 3 go quiet the moment layer 1
  does its job, instead of each leaving its own copy for someone to reconcile later.
- **A default orchestrator, since Claude Code has none.** `knowledge.config.json` accepts
  `"orchestrator": "<agent short name>"`; the same hook states once per session that work routes
  through that agent unless the user names another or is only asking a question. Omit the key and
  nothing is injected.

## 0.34.0

- **`/kb-forget` — retract, don't just delete.** Removing an article with `rm` was always the easy
  half: the base is a link graph, so every `[[reference]]` was left dangling, reindex reported each
  one as a dead link, and a lint nobody can read is a lint nobody reads. `scripts/kb-forget.mjs`
  repairs the references first — redirecting them to a replacement (keeping the original wording)
  or defusing them to plain text marked `(retracted)` — then removes the file. Dry run by default.
- **Typed relations.** Three optional flat frontmatter fields carry what a bare link cannot:
  `supersedes`, `superseded_by`, `depends_on`. They become their own edge kind in `graph.json`, so
  "what breaks if I change this?" is answerable from real dependencies rather than from mentions.
  `/kb-links` shows them separately; `--lint` flags one pointing at nothing.
- **The set is deliberately tiny and closed.** `[[links]]` already carry association, so a new
  relation only earns a place if something can act on it. `superseded_by` earns it by making
  retraction possible at all.
- **Code fences are examples, not references.** A slug inside a fenced block is left untouched
  when repairing, so documentation showing the syntax does not get rewritten.
- **`/kb-vocab`: a general term is no longer read as a misspelling of its own specialisation.**
  `audyt` (compliance, architecture, website audits) and `audyt-ai` (one product) sit one
  inflection apart once normalized — only the raw hyphen separates them. Adding a whole segment
  narrows a subject; adding letters to the same word is a plural.

## 0.33.0

- **`/kb-vocab` — one idea, one name.** Facets only work when a concept is spelled one way. Left
  alone a base drifts: `website`, `websites` and `www` become three separate facets, and a query
  that asks for one misses the other two. `scripts/kb-vocab.mjs` finds the drift — terms differing
  only in case, separators or diacritics (certain duplicates), plurals and misspellings
  (near-variants), tags outside an agreed vocabulary, and tags used exactly once — and proposes
  merges ordered by how many articles each touches.
- **Read-only by design.** It never rewrites an article. Choosing the canonical term is an
  editorial call, and a bulk rename of someone's tags is not a decision a script should make.
- **Careful about what it does NOT flag.** A numbered series (`etap-0`…`etap-9`) is a set of
  deliberate values, not drift. A narrower compound is not a misspelling of the shorter term —
  `leads-method` merely ends with `ads-method`. Short tags are skipped entirely, because at three
  characters a single edit links unrelated words. A false merge erases a real distinction, so the
  bar for suggesting one is deliberately high.
- **`--lint` catches the certain cases** on every run, so drift surfaces in CI rather than months
  later during a search that quietly returns half the articles.
- **Optional `vocabulary.json`** at the base root declares canonical tags, aliases and entity
  types; a model ships in `_templates/`. Without it the intrinsic checks still run — you get value
  before curating anything.

## 0.32.2

- **Fixed: generated output did not match the engine's language.** `reindex.mjs` wrote the
  "Suggested questions" section of `INSIGHTS.md` in a different language from everything else,
  so every base built with this plugin inherited it in a generated file. Now consistent.
- **Trimmed duplicate trigger phrases** from command descriptions and the AGENTS.md routing table.
- **Replaced a private project name used as the `/kb-bench` example** with a generic one.
- **Source comments in `viewer.html`** brought in line with the rest of the engine.
- **Removed `td_report.md`** — an internal technical-debt audit from before the project had tests,
  stating as fact that there were none (there are now 28, plus a package.json and CI). A stale
  working artifact, not documentation.

## 0.32.1

- **Fixed: the edition CI templates could never stop themselves.** Both `template/_ci/` workflows
  skipped a run when `head_commit.author.username` was `kb-bot` — but that field is GitHub's account
  lookup from the commit email, and it is empty unless a user with that email exists. With no such
  account the guard never fired and master → edition → master would ping-pong until the Actions
  minutes ran out. Matched on `author.name` instead, which is the raw git author the other workflow
  sets and does not depend on any account existing.
- **Documented where `KB_BOT_TOKEN` comes from** and why the built-in `GITHUB_TOKEN` cannot do the
  job (it is scoped to its own repo; these workflows write to another one). A machine account is
  optional, not required.
- **Seeded agent mention cards are gitignored.** `_mentions/` and `mentions/` carry a private agent
  roster and were protected only by `.git/info/exclude`, which is local to one clone and never
  travels — one `git add -A` from being published.

## 0.32.0

- **Department editions.** One master base can now publish a partial copy per department: everything
  marked `company` plus that one department's own knowledge, and nothing else. The boundary is still
  the repository — each edition is its own repo, so a team physically cannot hold what it was not
  given — but the master stays a single tree, so the `[[link]]` graph is never split.
  `node scripts/kb-build.mjs --dept sales --out ../kb-sales` publishes; `kb-collect.mjs` carries the
  team's own writing back the other way.
- **The subject of access control is a person, never an agent.** An agent reads whatever clone sits
  on the machine it was started on, so its reach is already its human's reach — there is no separate
  agent permission to configure, and none would be trustworthy if there were.
- **`visibility:` on any article** — `owners` / `company` / `department` (with `department:`), falling
  back to a path map in `knowledge.config.json` → `access.paths`, falling back to `owners`.
  **Fail-closed by design:** a forgotten field can never widen reach. `--lint` flags unknown values
  and `department` reach with no department named.
- **One writer per path.** Company knowledge flows down and is read-only in an edition; the
  department's own zone flows up and the master never overwrites it. Because no path has two sources
  of truth, the two directions cannot collide.
- **Three fail-closed gates on the way up** (`kb-collect.mjs`): path ownership, no self-promotion to
  `company`, and the ingest secret scan. Any breach rejects the whole batch and exits non-zero;
  deletions never propagate without `--allow-deletes`.
- **`kb-access.mjs`** reports what the current machine reaches — identity, role, departments — and is
  the shared resolver the other scripts use. **`/kb-edition`** drives all of it.
- **Automation templates** in `template/_ci/` (inert until you copy them into `.github/workflows/`),
  including the loop breaker both directions need.
- `/kb-upgrade` now refreshes the whole `scripts/` directory: the engine scripts import each other,
  and refreshing one alone could leave a base with a missing module.

## 0.31.1

- **Reindex lint fix.** The article scan skipped only `INDEX.md`, while zone pagination writes
  `INDEX.pN.md` pages — so the next run scanned the generator's own output and reported false
  "Missing frontmatter" warnings on it. Generated `INDEX(.pN).md` files are now excluded from
  the scan. No behavior change for real articles.

## 0.31.0

- **Galaxy map (🗺 Map).** The Map view grows three full layouts — **Cosmos** (a layered "second brain":
  skills sparkle ring → memory disc with per-zone swarms → tasks ring with planets & moons → projects hex
  ring), **Galaxy** (deterministic community clusters) and **Orbit** (hub-centric rings) — with zoom/pan,
  node search, label-density and colour toggles, zone/cluster legend with show/hide, a Projects focus
  dropdown, hover tooltips, drag-to-arrange with your layout remembered per base, and light/dark aware
  rendering. All offline, one canvas, no dependencies.
- **Pixel-art mode (▦).** An opt-in retro skin for the whole viewer — pixel display font, graph-paper +
  scanline texture, hard "sticker" shadows, square markers, segmented progress meters, CRT-style touches —
  remembered across sessions. Styling only: article prose stays readable, colour stays the signal.
- **Task trees (epics) on the board and task pages.** Tasks gain `parent:`, `order:`, `needs:` and
  `skill:` frontmatter; an epic's page shows a "📋 Plan — subtasks" panel with ordered steps, per-step
  status and assignees and a progress bar; board cards show the same tree inline. A "⏳ Waiting on you"
  lane surfaces subtasks whose predecessors are all done — your move.
- **Board toolbar.** Searchable assignee filter (dropdown scales to any team size) + due/priority sort,
  both remembered in the browser. Priority chips (P1/P2/P3) get their own colours.
- **Projects view (📁).** Pinned Projects list + per-project detail: task history as a version log
  (real repo versions via `repos.json` probing — GitHub release vs internal version, dirty/unpushed
  markers — or the internal v1.N counter), in-progress list and About.
- **Settings view (⚙️) grows stat cards and zone bars;** feature switches stay read-only with a hint to
  ask the assistant.
- **Fail-loud router.** A view that crashes renders a visible "⚠ View error" article instead of a blank
  page, and one view's leftovers can never poison the next (map-mode cleanup is unconditional).
- **Hardening:** every dynamic string in the new views goes through `escapeHtml`; backlink hrefs are
  slug-escaped (covered by tests).

## 0.30.1

- **Starter config no longer ships a stale engine version.** `template/knowledge.config.json` carried
  `0.28.0` while the engine was already `0.30.0`, so a freshly created base showed "engine v0.28.0" in
  the viewer's ⚙️ Settings / board. Bumped to match the current release. Metadata only — no behavior change.

## 0.30.0

- **Public engine stays core-only.** Trimmed the bundle back to the core workflow — onboarding, search,
  board, lint, sync. An optional command that had been bundled is no longer shipped here; bases that
  already installed it keep their own copy (installed copies come from the base's own bundle, not this plugin).

## 0.28.0

- **Same person, new computer — log in and go.** /kb-setup recognizes "I already use this": log into YOUR GitHub account and the agent **auto-discovers your bases** (your repos + your orgs, looking for knowledge bases), connects and registers them — no re-onboarding, no link-pasting, profile untouched. Falls back to the invite link only if nothing is found.
- **Identity & security — the GitHub account IS the login.** New AGENTS.md section + owner security check at setup: recommend **2FA/passkeys** (the CEO's credentials are the only way to "be" the CEO — agents never invent their own password layer), quiet FileVault check on macOS (the clone lives on disk; disk encryption + screen lock protect it), and lost-device guidance (revoke sessions/tokens). One account per person, never shared.
- Template config version field no longer ships stale.

## 0.27.0

- **`/kb-settings` — turn features on/off anytime**, not just at onboarding: show current toggles, flip them conversationally ("enable journaling", "turn off private goals"); when enabling, the agent offers to start the ritual right away. If a user asks for something a disabled feature provides, agents offer to enable it instead of refusing.
- **⚙️ Settings view in the viewer** — a pinned entry (like the task board) showing what's enabled (journal, goals), content language, engine version and zones in use, with a hint that the assistant changes these. `kb-data` now carries `features` + `version` from the config.

## 0.26.0

- **Shared & recurring tasks** — `assignee:` accepts a list (`[anna, adrian]`) so several people can own one task; "what is <person> working on?" matches any co-owned task. New `recur: daily|weekly|monthly` — completing a recurring task rolls it to the next period (🔁 on the board) instead of closing it.
- **AI journaling — `/kb-journal` + `journal/` zone.** A light rhythm the agent runs conversationally: **daily check-in** (what got done · blockers · one win · tomorrow's #1 — and it syncs the board: done→done, blockers→blocked, new work→offered as tasks), **weekly planning** (review + agree the top 3 → now.md & board), **monthly goals** (3–5, professional/private) and **month-end review** (achieved / not / carry-overs) written into one goals file per person per month. One file per person per entry — no merge conflicts. Best practices baked in: 3 short questions, specifics over adjectives, blockers are gold, never judge.
- **Feature toggles** — onboarding asks once whether to run the rhythm; the answer lands in `knowledge.config.json` → `features` (`journal`, `goals` — incl. `"professional"` = no private section). Agents must respect toggles and can flip them anytime on request.

## 0.25.0

- **Task board — the base is now a lightweight project manager.** New `tasks/` zone: one small file per task (`status: todo|doing|blocked|done`, `assignee`, `project`, `due`, `priority`) — many users can add/update concurrently with zero merge conflicts. The engine compiles **`BOARD.md`**, a bounded kanban (columns by status, open work grouped by project, ⏰ overdue flags, done capped at 15), linked from the root map with an open-task count.
- **`/kb-task`** — add / update / assign / complete a task conversationally (infers everything it can, asks one short question at most); agents offer it when action items emerge (incl. `/kb-meeting` action items → board) and, when asked to DO a task, read the project article first and respect the ⛔ non-goals, then mark it done with an outcome note.
- **`/kb-board`** — fluent board views: whole kanban, "what's on my plate", per-project, overdue-only — rendered in the user's language with one useful nudge.
- **Viewer gets a visual kanban** — a pinned "📌 Task board" entry renders columns with assignee/project/due chips and overdue highlighting; cards click through to the task articles.
- Intent routing, `/kb-help` and the built-in guide updated; `tasks/BRIEF.md` documents the procedure (incl. the execute-a-task rules for agents).

## 0.24.0

- **Instant context — agents land on the right knowledge without being told.** Three pieces: (1) the global awareness block now instructs every agent to read `CONTEXT.md`/`now.md` at session start and to **auto-match the current project** against `projects/` (grep the git remote URL / folder name against `resource:`/repo lines) and read its article FIRST — goals, status and hard ⛔ non-goals included; (2) new **`/kb-link-project`** wires a project repo to its article explicitly — an idempotent pointer block in the project's AGENTS.md/CLAUDE.md plus a bidirectional `resource:` link in the article; (3) the golden rule gains step 0 (project match) in `AGENTS.md`.

## 0.23.1

- Test fix: `--stats` test now asserts relative to shipped starter content (the built-in guide article broke its hardcoded count in 0.23.0).

## 0.23.0

- **Built-in user guide in every base** — the template now ships `concepts/how-to-use-this-base.md`: the "just talk" table, every /kb-* command explained, the `./kb` viewer, and where sensitive knowledge belongs. New bases are never empty and the guide is searchable + visible in the viewer (aka: help, manual, cheat sheet).
- **Onboarding knows about restricted bases** — at the end of a NEW setup the owner/CEO hears one sentence: sensitive things (board, salaries, legal) belong in a separate restricted base — say the word. Not set up unless asked; employees joining are unaffected (they simply are not granted access).

## 0.22.0

- **Bounded facets at scale** — `INDEX-facets.md` no longer grows without limit: each tag/entity line lists the 40 most recently updated articles plus a "+N more (grep)" pointer. At a 10,000-article benchmark the file drops 1.8 MB → ~0.5 MB with every line bounded; reindex stays ~0.5 s, root map ~1 KB, zone pages ≤ ~30 KB, client lookup via grep ~0.1 s.
- **Confidential knowledge — the repo IS the boundary** — new `AGENTS.md` section: git permissions are per-repository, so restricted knowledge (board, salaries, legal, personal data) lives in a **separate access-limited base** (created with the same `/kb-init` flow); an employee's agent physically cannot read a base that isn't cloned on their machine. Cross-reference by title only; `confidential: true` flags are explicitly NOT protection. `/kb-ingest` now triages sensitive material and asks which base it belongs to before writing; fixed step numbering.

## 0.21.0

- **`/kb-meeting` — capture a meeting in one paste** — the user pastes notes/a transcript (or says two sentences); the agent distills decisions + action items into `meetings/`, tags the client in `entities:` (powering "show me everything about <client>" via facets), ripples decisions to `D-NNN` and focus to `now.md`, and offers itself proactively whenever a meeting comes up in conversation.
- **Just talk — intent routing** — users no longer need to learn commands: `AGENTS.md` maps natural phrasings (any language) to procedures — ask → query/find, "save this" → ingest, meeting notes → kb-meeting, "new project" → kb-new-project, "anything new?" → sync, "how do I use this?" → kb-help. Commands remain as optional shortcuts.
- **`/kb-help`** — a friendly one-screen cheat sheet rendered in the user's language; onboarding now teaches exactly one thing ("just talk to me") instead of a command list.
- **Capture loop** now explicitly says to tag clients/companies/products in `entities:` wherever discussed.

## 0.20.0

- **Engine upgrade path — `/kb-upgrade`** — a base keeps a copy of the engine from when it was created and used to stay there forever. The new command syncs the engine files (`scripts/reindex.mjs`, `viewer.html`, `kb`) from the installed plugin into a base, appends any newly required `.gitignore` lines, bumps `version` in `knowledge.config.json`, verifies with a reindex, and commits — company content, config, templates and `AGENTS.md` customizations are never touched. Refuses to downgrade; requires a clean git tree so the upgrade is one revertible commit.
- **`install.mjs --list` reports versions** — each detected base now includes its `version` plus an `outdated` flag against the installed `pluginVersion`, so agents can proactively offer `/kb-upgrade` (e.g. during setup on another machine).

## 0.19.0

- **Simpler onboarding** — /kb-setup consolidated from 8 steps into 4 clear phases (figure out the situation, get connected, make it yours, get going), with an explicit up-front summary of what the user actually does (~2-3 questions: a link or company+language, a login, and their name/role). Same capability (detect-first, NEW vs JOIN, GitHub account guidance, employee join, optional conversational onboarding) — less friction and less to get wrong. Joining a company that already uses the base is the minimal path: paste link -> log in -> name/role.

## 0.18.1

- **Onboarding coherence pass** — fixed two stale step references in /kb-setup after the step renumbering (the connect-existing and already-elsewhere paths now jump to the wrap-up step, not the new conversational-onboarding step, so existing users are not re-onboarded). Reviewed the whole flow end-to-end; the org-already-uses-KB path (detect, connect, or new-employee JOIN with invite/access/write guidance) is consistent.

## 0.18.0

- **Conversational onboarding right after install** — once the base is ready, the agent automatically (without being asked) gets to know the person and their work: goals, active projects (offered as /kb-new-project so the base starts with real content, not empty zones), how they like to work, and this week focus (now.md). New employees get a lighter version (enrich their own profile; company context untouched). Everything is one-question-at-a-time and skippable.

## 0.17.0

- **New-employee JOIN flow** — onboarding now leads a new team member onto the company base: sign in as themselves, get access to the PRIVATE repo (if the clone is blocked, the agent explains in plain words to ask the admin for an invite to the repo/organization, then retries — never shows a raw error), inherit company/language/departments, and save their profile back so the team sees they joined (read-only access is detected and flagged). Clean separation: creators make a repo under their own org; employees join the existing one.

## 0.16.0

- **Onboarding for non-technical clients & multi-company use** — each company gets its OWN private repo under THEIR account/organization. /kb-setup now: (a) if the user has no GitHub account, guides them through creating one (and optionally a company Organization) instead of silently falling back to a local-only base; (b) when bases already exist, offers to open one, join a different company, or set up a NEW base for a different company (for people/consultants running several) — never merging two companies into one base.

## 0.15.0

- **Detect-first onboarding** — `/kb-setup` and `/kb-init` now look for an existing base BEFORE asking anything. New `install.mjs --list` reports every base already on the machine (shared registry + ~/knowledge scan) with names, detected tools and which tool adapters are installed — so a base set up in one app (Claude Code / Codex / Antigravity) is reused, not duplicated, when you set up another.
- **Clearer, hand-held flow** — one friendly question covers the three cases (have a link = JOIN / it is elsewhere = connect / nobody uses one = NEW); the agent runs everything, confirms before creating, and never starts a fresh base when one already exists. JOIN still inherits company/language/departments; NEW asks only name + writing language.

## 0.14.2

- **License clarity** — added a `license: MIT` field to the plugin manifest and a visible attribution line in the README. The project stays **MIT**: free to use, modify and deploy in your organization, provided the copyright/attribution notice (Adrian Skobiej) is kept on reuse or modification.

## 0.14.1

- **Added RELEASING.md** — a maintainer guide for shipping a change so code, version, git tags, GitHub Releases and descriptions stay in sync (bumping the version alone is not a release). README points to it; Changelog line no longer hardcodes a stale version.

## 0.14.0

- **Per-zone procedures shipped in the starter** — every zone now includes a `BRIEF.md` (projects, skills, people, meetings, concepts, departments) describing what belongs there and the step-by-step add procedure (dedup-first, which template, required frontmatter incl. `type`, linking, reindex, log). New bases get the mechanics out of the box instead of empty zones.

## 0.13.0

- **OKF-compatible (Open Knowledge Format)** — every concept now carries a `type` (the one field OKF requires): the engine honors an explicit `type:` and otherwise derives it from the zone (projects-Project, skills-Skill, people-Person, meetings-Meeting, concepts-Concept, departments-Department), so bundles are OKF-conformant out of the box and interoperate with the OKF ecosystem. Added optional `resource:` (canonical URL/repo), shown in the viewer. Templates carry `type`. We keep our own conventions (wikilinks, rich paginated index) on top — OKF is permissive. No GCP/Dataplex tooling involved.

## 0.12.1

- **Base `version` no longer drifts** — the template config starts at the current version and onboarding (`/kb-init`, `/kb-setup`) stamps a NEW base's `version` from the installed plugin's version, so a base records which engine created it instead of a stale default.

## 0.12.0

- **Onboarding now branches NEW vs JOIN, and asks the writing language** — `/kb-setup` and `/kb-init` first decide whether you are creating a NEW base or JOINING an existing org base, and that gates the questions. **NEW base:** asks the company name and the **preferred content language** (sets `company.language`, the default everyone inherits) and seeds `CONTEXT.md`. **JOIN:** inherits company name, departments and language from the existing base — no setup questions, just who-you-are. Joiners are added to the `roster`. The end-of-setup tips now mention `/kb-find` and `/kb-new-project`.

## 0.11.0

- **Dedup & update check before adding** — agents now check the base (search-by-meaning) BEFORE adding any entry. If nothing covers it, add normally; if something does, compare and — when the new info changes something — show existing vs new and **ask the user whether to update or keep**, then refine in place (no duplicate file, no changelog). Contradictions are surfaced, not silently resolved. Keeps the base de-duplicated and trustworthy with many contributors. Wired into `/kb-ingest` and `AGENTS.md`.

## 0.10.1

- **Content language is the contributor's choice** — replaced the rigid "English only" content rule with "write in your company's working language"; mixed languages within one base are fine. The interface/structure (viewer, engine, AGENTS.md, frontmatter keys, slugs) stays English.

## 0.10.0

- **Search by meaning — no vector DB** — `/kb-find` now does **query expansion**: the agent brainstorms synonyms / related terms / phrasings (using the glossary to map concepts to the base's real terms), then greps all of them — semantic-style retrieval with the LLM as the engine, zero infra and nothing leaving the base. Plain keyword search missed things written in different words; this bridges the vocabulary gap.
- **`## Questions it answers` section** — optional article/template section listing the questions an article answers, so a meaning-based search hits it even when the body wording differs.

## 0.9.0

- **Zone-index pagination — bounded files at any scale** — a zone with more than 150 articles is split into `<zone>/INDEX.pN.md` pages (≤150 each), with `<zone>/INDEX.md` becoming a small table-of-contents (title ranges). No generated index file grows unbounded: root map ~1 KB, zone TOC ~1 KB, each page ≤ ~35 KB — so no single agent read blows up context, even at thousands of articles across many contributors. `INDEX-facets.md`/`GAPS.md` documented as grep targets. Benchmark: 2000 articles reindex in ~0.25s; generated indexes are gitignored so concurrent contributors never hit merge conflicts on them.

## 0.8.1

- **Viewer renderer fix** — Markdown tables now render as real `<table>` elements (previously shown as raw `| ... |` text). Added table styling. Engine benchmark: reindex of 2000 articles in ~0.13s, root index stays ~1 KB.

## 0.8.0

- **`GAPS.md` — incomplete/unverified to-do list** — `reindex` generates a punch-list of every `⚠` flag, draft and stale article, surfaced in the root map. Agents are told to treat `⚠` items as UNKNOWN (not fact), which cuts confidently-wrong answers; the user gets a fill-in checklist.
- **Aliases — `aka:` frontmatter** — optional synonyms for an article (e.g. the owner profile `aka: [boss, owner]`) folded into the index line and the viewer search, so grep/search hit alternative phrasings.
- **`kb` launcher** — a zero-dependency shell script: `./kb` reindexes and opens the offline viewer; `./kb lint` / `./kb stats` for health-check/stats. Easier human access without an agent.
- **Viewer search** now also matches `aka` and `entities`.

## 0.7.0

- **Facets — `INDEX-facets.md` + `/kb-find`** — `reindex` generates a tag → articles and entity → articles index from a new optional `entities: [client, product, person]` frontmatter field, so you can jump to "everything about <client>" in one hop. New `/kb-find` command does a precise lookup via grep or facets instead of loading whole indexes.
- **Lifecycle & archiving** — `status:` flows `draft → stable → archived`. `status: archived` keeps a file on disk (still grep-able, still in the viewer) but drops it from the index listings, so finished/dead items don't clutter retrieval; the root index shows an archived count. `--lint` already flags stale (>6 months) articles.
- **Capture loop** — `AGENTS.md` now instructs agents to write durable bits back as they work (refine the article in place, log meetings/decisions, keep `now.md` current) so context compounds with use.
- Still zero-infra and tool-agnostic — Markdown + ripgrep, no vector DB.

## 0.6.0

- **Scale-ready hierarchical index** — `reindex` now writes a small **root `INDEX.md` map** (zones + counts + "Start here" + briefs) plus a **per-zone `<zone>/INDEX.md`** listing. Agents read the map, open only the zone they need, then 1–5 articles — so retrieval stays fast even with hundreds/thousands of articles (the root inlines full listings only while the base is small, ≤40 articles).
- **Always-on core context** — new `CONTEXT.md` (compact: who the owner is, goals, active work, preferences, how to navigate) and `now.md` (current focus), surfaced as "Start here" and read first every session. Gives the agent maximum situational awareness without loading the whole base.
- **Grep-first lookup** — `AGENTS.md` documents grepping titles/summaries/tags for precise lookups at scale (plain Markdown + ripgrep, zero infra — no vector DB, stays tool-agnostic).
- **`.gitignore`** — whitelists `CONTEXT.md`/`now.md`, ignores generated `*/INDEX.md`.

## 0.5.0

- **Two new zones: `skills/` and `meetings/`** — skills (Claude skills) and meeting records (date, attendees, decisions, action items) are now first-class entity types alongside `projects/`, `people/`, `concepts/`, `departments/`. Engine `CONTENT_DIRS` updated; new `_templates/skill.md` and `_templates/meeting.md`.
- **`/kb-new-project` — project onboarding interview** — creating a project is an interview, not a silent stub: the agent asks for description, goal, status, repo/dir/URL, stack, ✅ in-scope and ⛔ non-goals (a HARD boundary), marks unknowns `⚠ TBD`, proposes, then writes `projects/<slug>.md`.
- **Richer project template** — `_templates/project.md` now carries What it is / Goal / Status / Repo / Stack plus explicit ✅ in-scope and ⛔ out-of-scope (non-goals) guardrail sections.
- **Multi-agent contract in `AGENTS.md`** — an explicit "Every agent works the same way" section so Claude Code, Antigravity, Codex and Cowork all read the owner profile first and follow the same project/knowledge/logging rules.
- **English-only content rule** — all knowledge-base content is written in English regardless of the conversation language; unknowns flagged `⚠ TBD`.

## 0.4.0

- **`/kb-stats` + `reindex --stats`** — base health at a glance: article counts per section and per author, drafts, orphans, and stale articles. Read-only.
- **Stale detection** — `--lint` now flags articles whose `updated` is older than 6 months (knowledge rot).
- **Config validation + louder errors** — `knowledge.config.json` is validated (`roster` must be an object, `departments` an array) and parse failures surface as health-check warnings instead of being silently swallowed.
- **CI hardening** — Node version matrix (18 / 20 / 22) and a separate secret-scan job (`scripts/check-secrets.mjs`, zero-dependency, high-signal patterns).
- **viewer.html** — a "Recently updated" section, search now also matches author + status, and a defense-in-depth CSP meta (blocks `<base>` hijack, plugins/embeds, form exfil).

## 0.3.1

- **Test suite** (`node --test`, zero dependencies) covering the engine (INDEX/kb-data build, author surfacing, XSS sanitization, `</script>` escaping, whitelist `.gitignore`, `--lint`, git-hook install) and the installer (per-tool adapters, Codex frontmatter, idempotent global awareness, `--dry-run`). Run with `npm test`.
- **CI** (GitHub Actions): syntax check + tests + template lint on every push/PR.
- **Hardening:** `viewer.html` now HTML-escapes slugs when building backlink `href`s, closing a narrow DOM-XSS path where a crafted article slug could break out of the attribute (found while writing the tests).

## 0.3.0

Adopted battle-tested ideas from a sibling system (ContextHub):

- **Whitelist `.gitignore`** — the base ignores everything by default and shares only the knowledge zones. Raw source material (`raw/`), stray files, exported data and secrets stay local and can never leak to the remote; sharing requires an explicit edit. Security by default.
- **Sharper ingestion** (`/kb-ingest` + `AGENTS.md`) — entity-granularity rule (own lifecycle → own file, else a row in a parent), the "would an LLM querying this in 6 months actually use it?" filter, facts-with-source, marked hypotheses, transcribe visuals first, and an explicit propose→accept step before writing.
- **Author from Git** — author slug derived from your git email via a `roster` in `knowledge.config.json`, stamped as `author:` in each article and shown in `INDEX.md` + the viewer. File author matches commit author; no second source of truth.
- **Decisions & history** — `wiki/decisions.md` (append-only `D-NNN`: who / decision / why / consequences) and per-person `wiki/log/log-<slug>.md` activity logs (everyone writes only to their own file → no merge conflicts).

## 0.2.0

**Rebase-safe team sync — multiple contributors, one base, nobody's entries lost.**

- `/kb-sync` now integrates teammates' work with `git pull --rebase --autostash` instead of `--ff-only`. It replays your local commits on top of the team's and restores uncommitted edits — so syncing never stalls and never discards your changes.
- `/kb-deploy` pulls (rebase) before pushing, so your push is additive and isn't rejected when someone pushed first.
- Conflicts only occur if two people edit the *same* file; in that case the commands STOP for manual resolution and never force or discard. Different articles are different files, so normal additions merge cleanly.
- Generated `INDEX.md` / `kb-data.js` stay git-ignored → zero merge noise.

Workflow recap for a shared private base: each person keeps a local clone, adds knowledge, `/kb-deploy` to push, `/kb-sync` to pull others' additions. Same base from Claude Code, Codex, Antigravity, or Cowork.

## 0.1.0

Initial release.

- Markdown is the source of truth; zero-dependency `scripts/reindex.mjs` compiles a lightweight `INDEX.md` (for LLMs) and a standalone offline `viewer.html` (for humans).
- Tool-agnostic: every base ships an `AGENTS.md`; `install.mjs` installs `/kb-*` command adapters for Claude Code / Codex / Antigravity and sets up cross-project global awareness; git-hook auto-reindex for non-Claude tools.
- `/kb-*` commands with natural-language triggering (`init`, `setup`, `ingest`, `query`, `lint`, `sync`, `deploy`).
- "Data room" layer: source provenance & authority, per-folder briefs, conflict/gap reports, code-enforced protected quotes.
- Security: the Markdown→HTML renderer escapes `& < > " '` and allows only `http`/`https`/`mailto`/anchor/relative URLs (no stored XSS in `viewer.html`); `kb-data.js` escapes `</script>`.
- English-only; MIT licensed.
