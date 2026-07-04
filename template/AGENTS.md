# AGENTS.md — knowledge base (knowledge-os)

> Every AI assistant (Claude Code, Codex, Antigravity, Cursor…) reads this file when it
> opens this directory. It describes what this base is and how to work with it — with no
> tool-specific install. The `/kb-*` commands are just convenient shortcuts for the
> procedures below; if your tool doesn't have them, run the steps by hand.

## What this is

A company knowledge base. The source of truth is `.md` files with frontmatter in:
`projects/`, `skills/`, `people/`, `meetings/`, `tasks/`, `concepts/`, `departments/`. From them we generate:
- `INDEX.md` — root map (zones + counts + "Start here" + briefs). **Read it FIRST.**
- `<zone>/INDEX.md` — per-zone listing (one line/article) for large-base navigation.
- `kb-data.js` — data for `viewer.html` (the human-facing reader, offline).

These are generated and in `.gitignore` — never edit them by hand. The hand-written
always-on context lives in `CONTEXT.md` (core) and `now.md` (current focus).

**Language: write content in your company's working language.** The base's default writing language is
**`company.language`** in `knowledge.config.json` — set once at setup by the first person and inherited
by everyone who joins. A contributor may still write in their own language; mixed languages within one
base are fine, and you don't translate someone else's entry to match. Always keep in **English** (the
structure/interface): the viewer UI, the engine, this operating manual (`AGENTS.md`), frontmatter
**keys** (`title`, `slug`, `category`…) and `slug` values. Proper names stay as-is.

## What goes here (and what does NOT)

This holds ONLY distilled knowledge (.md): decisions, processes, facts, people, lessons.
It is NOT a project store. Never copy project source code, whole files, or repositories
here. Projects stay where they are (scattered across disk) — you only SAVE knowledge from
them into this base. Do the work in the project's own folder; save the knowledge here.

Safety by default: the base uses a whitelist `.gitignore` — everything is ignored unless
explicitly allowed. Only the knowledge zones are shared; stray files and the raw source in
`raw/` stay local and are never pushed. Leaking something requires an explicit edit.

## Golden rule for the assistant — navigate, don't load everything

The base is built to stay fast even when it is very large. Navigate top-down:

0. **Working inside a project?** Check whether it's documented here: grep `projects/` for the
   project's git remote URL or folder name (articles carry `resource:`/repo lines) — or follow the
   pointer block that `/kb-link-project` puts in the project's own AGENTS.md/CLAUDE.md. If matched,
   read that article FIRST: it holds the goal, status, ✅ in-scope and the hard ⛔ non-goals.
1. **`CONTEXT.md`** (+ **`now.md`**) — always read first: who the owner is, goals, active work,
   preferences, current focus. This is your standing context.
2. **`INDEX.md` (root map)** — zones with counts + "Start here" + briefs. Do NOT expect every
   article here; at scale the root only shows the map.
3. **Zone index** — open the relevant `<zone>/INDEX.md` (e.g. `projects/INDEX.md`) for its
   one-line-per-article listing; pick 1–5 by `summary`/`tags`. For a very large zone this file is a
   small **TOC of pages** (`<zone>/INDEX.pN.md`, ≤150 articles each) with title ranges — open the
   page you need, or better, grep.
4. **Articles** — open only those, then follow `[[slug]]` links.

Every generated file is size-bounded (root map ~1 KB, zone TOC ~1 KB, each page ≤ ~35 KB) so no
single read blows up your context, no matter how big the base gets. `INDEX-facets.md` and `GAPS.md`
are **grep targets** — grep them for the tag/entity/term you want; don't load them whole.

**Precise lookup at scale:** instead of loading indexes, **grep** the base for a name/term across
`summary`/title/tags (e.g. `rg -i "acme" */*.md`), then open the hits. Index = the map; grep =
the lookup.

## Every agent works the same way (multi-agent contract)

This base is tool-agnostic — Claude Code, Antigravity, Codex, Claude Cowork all follow the
SAME rules. Regardless of which agent you are:

- **Know the user first.** Read the owner / primary-user profile in `people/` (goals, active
  projects, stack, working style) before acting — it's the context every agent should have.
- **New project = a structured article.** When a new project appears, create
  `projects/<slug>.md` from `_templates/project.md`. It MUST carry: **What it is**, **Goal**,
  **Status**, repo/dir/URL, **✅ in-scope (how agents should help)** and
  **⛔ non-goals (what agents must NOT do)**. Non-goals are a **HARD boundary** — do not act
  in those areas without explicit user approval.
- **Record knowledge, not a changelog.** Save durable, reusable knowledge by refining the
  relevant article IN PLACE (overwrite/improve — don't append change-by-change). Code diffs
  belong in the project's own git, not here.
- **Log your work in one line.** Append a single line to `wiki/log/log-<author>.md` noting what
  you did and which agent you are, e.g. `2026-06-23 [antigravity] — …`. One file per author →
  no merge conflicts.
- **Decisions** that change how we work → a new `D-NNN` entry in `wiki/decisions.md`.

## Workflow (procedures = /kb-* commands)

- **Query** (`/kb-query <question>`): read `INDEX.md` → open the relevant articles →
  answer concisely, citing file paths. Weigh `authority` (`primary` > `secondary` >
  `derived`). Surface contradictions, don't resolve them.
- **Find** (`/kb-find <term|tag|entity>`): precise lookup, especially in a large base.
  **Search by meaning, not just the literal words** — things aren't always written the way they're
  asked. Do this (it's semantic search using YOU as the engine, no vector DB):
  1. **Expand the query first.** From the user's intent, brainstorm 3–8 synonyms / related terms /
     likely phrasings. Use the glossary (if present) to map concepts to the base's actual terms.
  2. **Grep all of them**, e.g. `rg -i "lead|prospecting|acquisition|crm" */*.md`, and check `aka:`
     aliases. Or open `INDEX-facets.md` to jump by tag/entity.
  3. **Open the hits**, judge relevance by meaning, follow `[[links]]`. If still nothing, scan the
     relevant `<zone>/INDEX.md` summaries and reason about which fit — don't stop at literal misses.
- **Add knowledge** (`/kb-ingest [path|topic]`): **first run the dedup & update check (below)**,
  then read the raw material from `raw/`, check `INDEX.md` and the target folder's `BRIEF.md`, write
  article(s) `.md` with full frontmatter (models in `_templates/`), link via `[[slug]]`, run reindex.
- **New project onboarding** (`/kb-new-project [name|repo]`): when a new project is created,
  do NOT silently write a stub — **interview the user first**, then fill
  `_templates/project.md`. Ask (and don't invent — mark anything unknown `⚠ TBD`):
  1. **Name + slug** (kebab-case).
  2. **What it is** — the project in 2–3 sentences.
  3. **Goal** — the outcome; definition of "done".
  4. **Status** — active / on hold / done.
  5. **Repo / dir / URL** — GitHub, path on disk, production URL.
  6. **Stack** — key technologies / services / accounts.
  7. **✅ In scope** — how agents should help.
  8. **⛔ Out of scope (non-goals)** — a **HARD boundary**; agents do not act there without
     explicit approval.
  9. **Relations** — `[[slug]]` links to people / other projects / skills.

  Prefer asking interactively (an options/question UI if the tool has one; otherwise a numbered
  list). Then: propose the filled article (path + content), get an explicit OK, write
  `projects/<slug>.md`, run reindex, and log one line in `wiki/log/log-<author>.md`.
- **Health-check** (`/kb-lint`): `node scripts/reindex.mjs --lint` — missing fields, dead
  links, orphans, duplicates, protected-quote signals.
- **Sync** (`/kb-sync`): `git pull --rebase --autostash` → reindex (integrates teammates' work without losing yours).
- **Deploy** (`/kb-deploy`): reindex --lint → `git add -A` → commit → `git pull --rebase --autostash` → push.
- **Meeting** (`/kb-meeting`): paste notes/transcript → distill decisions + action items into
  `meetings/`, tag the client in `entities:`, reindex, log.
- **Help** (`/kb-help`): one-screen, plain-language cheat sheet in the user's language.
- **Task** (`/kb-task`): add / update / assign / complete a task — one small file per task in
  `tasks/`; the engine compiles `BOARD.md` (kanban). Full procedure: `tasks/BRIEF.md`.
- **Board** (`/kb-board`): show the kanban — whole board or filtered by person/project/overdue.
  Tasks can have SEVERAL owners (`assignee: [anna, adrian]`); "what is <person> working on?" matches
  any task they co-own. To EXECUTE a task, read its project article first and respect the ⛔ non-goals;
  then mark it done. Recurring tasks (`recur:`) roll forward instead of closing.
- **Journal** (`/kb-journal`): the AI-journaling rhythm — daily check-in, weekly planning, monthly
  goals (professional/private) & review. Offer the daily check-in once on the first conversation of
  the day — ONLY if `features.journal` is on. Conventions: `journal/BRIEF.md`.

## Just talk — no commands required (intent routing)

Users should NOT have to learn commands — the commands are shortcuts for you, not homework for them.
When the user's words match an intent, run the matching procedure yourself:

| The user says (any phrasing, any language) | You run |
|---|---|
| "what do we know about X" / "how do we do Y" | Query / Find |
| "remember this", "save this", pastes a doc/note | Add knowledge (dedup first) |
| recounts a call / "we met with <client>" / pastes meeting notes | offer **/kb-meeting** |
| "add a task", "I'll do it tomorrow", an action item emerges | offer **/kb-task** |
| "what's on my plate", "show the board", "what's overdue" | **/kb-board** |
| "what is <person> working on?", "tasks of <person>" | **/kb-board** (filter by that person) |
| "let's do my check-in", "podsumujmy dzień", "plan the week", "goals for the month" | **/kb-journal** |
| "what's enabled?", "enable journaling", "turn off private goals" | **/kb-settings** |
| "we're starting a project/engagement <name>" | offer **/kb-new-project** |
| "anything new from the team?" | Sync |
| "how do I use this?" / seems lost | **/kb-help** |

Offer once, in one sentence; don't nag. The goal: using the base = a 30-second conversation.

## Engine commands (work in every tool)

```
node scripts/reindex.mjs                 # rebuild INDEX.md + kb-data.js
node scripts/reindex.mjs --lint          # health-check only, no writes
node scripts/reindex.mjs --bless-quotes  # approve protected quotes (quotes.json)
node scripts/reindex.mjs --install-git-hook  # universal auto-reindex (commit/pull/checkout)
./kb            # convenience: reindex + open the offline viewer (./kb lint | ./kb stats)
```

After every change to `.md` articles, run `node scripts/reindex.mjs` so `INDEX.md` and the
viewer stay fresh. (Claude does this automatically via a hook; other tools — via the git
hooks from `--install-git-hook`, or manually.)

**Engine upgrades:** a base keeps a COPY of the engine from when it was created. After the
knowledge-os plugin updates, run `/kb-upgrade` — it syncs the engine files
(`scripts/reindex.mjs`, `viewer.html`, `kb`) and bumps `version` in `knowledge.config.json`;
company content and customizations are never touched.

## Before adding: dedup & update check (ALWAYS, before any new entry)

Never blind-add. Before writing a new entry — or a new fact into an existing one — check the base
first. This keeps it de-duplicated and trustworthy even with many contributors.

1. **Search by meaning first.** Use `/kb-find` (expand the request into synonyms/concepts, then grep
   + `INDEX-facets.md`) to find any article/section that already covers this.
2. **Nothing covers it** → add normally (`/kb-ingest` or `/kb-new-project`).
3. **Something already covers it** → compare the new info against the existing article:
   - **Already there / same** → do NOT duplicate. Tell the user it exists and cite the path.
   - **New info adds or changes something** → decide which is newer / more authoritative (compare
     `updated`, `source`, `authority`). Show the user the **existing text vs the new**, and **ask:
     update the article, or keep it as-is?** Update only on explicit OK — refine **in place** (don't
     append a changelog, don't create a duplicate file).
   - **They contradict** → surface the contradiction to the user; don't resolve it silently.

## How to add knowledge well

1. Required frontmatter: `title`, `slug`, `category`, `summary`, `status`, `author`, plus **`type`**
   (OKF — derived from the zone if omitted). Optional `resource:` = a canonical URL/repo. Model in
   `_templates/`. This base is **OKF-compatible** (Open Knowledge Format): markdown + frontmatter with a
   `type` on every concept, so bundles interoperate with the OKF ecosystem.
2. `summary` = one concrete sentence (the only thing the assistant sees in the index).
3. Granularity (file vs row): if the thing has its own lifecycle — updates independently, has its own owner/ID, someone may need only it — give it its own `.md`. If it's a small annotation, make it a row/section inside a parent article. Don't shard trivia; don't bury independent things.
4. Quality filter: keep only what passes "would an LLM querying this in 6 months actually use it?". Record facts with their source; mark hypotheses/assumptions as such; drop paraphrase, speculation, raw code, secrets.
5. Transcribe first: turn screenshots / diagrams / charts into text before saving — the base is text the LLM reads.
6. Provenance (optional): `source` + `authority` (`primary`/`secondary`/`derived`) per the folder's `BRIEF.md`.
7. Link liberally via `[[slug]]`.
7b. **Make implicit meaning findable:** add `aka:` synonyms, and optionally a `## Questions it
    answers` section listing the questions/phrasings the article answers — so a search by meaning
    (grep / query expansion) hits it even when the wording differs from the body.
8. Human-in-the-loop: propose the article (path + content) and get an explicit OK before writing. Outsource the thinking, not the understanding.
9. Open `viewer.html` to browse the base like a human.

## Findability metadata (so retrieval stays good at scale)

- **`summary`** is the retrieval surface — write it with real keywords (the agent sees only this in
  the index). **`tags`** for facets; **`entities: [client, product, person]`** for cross-cutting
  lookup (a client/product referenced from many articles). Both feed `INDEX-facets.md`.
- **`aka: [synonym, synonym]`** — optional aliases for an article (e.g. the owner profile
  `aka: [boss, owner]`). They go into the index line and the viewer search, so grep/search hit
  alternative phrasings.
- The base is **grep-first**: plain Markdown + ripgrep scales to huge bases with zero infra. The
  index is the map; grep / `INDEX-facets.md` is the lookup. No vector DB — keeps it tool-agnostic.
- **`GAPS.md`** (generated) lists every `⚠` flag, draft and stale article. Agents: treat `⚠` items
  as UNKNOWN — never present them as fact. It's the user's fill-in to-do list.

## Lifecycle & archiving (keep the base "effectively small")

- `status:` lifecycle: `draft` → `stable` → `archived`. **`status: archived`** keeps the file on
  disk (still grep-able, still in the viewer) but drops it from the index listings, so dead/finished
  things don't clutter retrieval. To revive, set it back to `stable`.
- `--lint` flags **stale** articles (`updated` older than 6 months) — review and refresh or archive.

## Capture loop (context compounds with use)

The base's edge over a memoryless chat is that it remembers. As you work WITH the owner, write the
durable bits back — cheaply:
- New durable knowledge → refine the relevant article IN PLACE (don't append a changelog).
- A meeting with outcomes → `meetings/` (offer `/kb-meeting`); its action items → offer tasks on the board (`/kb-task`); a decision that changes how we work → `D-NNN`.
- **Tag clients/companies/products in `entities:`** wherever they're discussed — that's what powers
  "show me everything about <client>" later (facets / `/kb-find`).
- Keep **`now.md`** current — update it when the focus shifts.
- One line in `wiki/log/log-<author>.md` per change. At the end of a working session, briefly
  propose what's worth persisting, then capture it on an OK.

## Feature toggles (respect the company's choices)

`knowledge.config.json` may carry `"features"`, e.g. `{ "journal": false, "goals": "professional" }`.
Agents MUST respect these: never offer a disabled ritual (no daily check-ins if `journal: false`; no
private-goals section if `goals: "professional"`). Set at onboarding, **changeable anytime via `/kb-settings`** (show current toggles, flip on request —
when enabling, offer to start the ritual right away). Missing key = feature available but never
pushed: offer once, back off if declined. If the user asks for something a disabled feature provides,
say it is off and offer to enable it — never just refuse. The viewer shows the same state under
**⚙️ Settings**.

## Identity & security — your GitHub account IS the login

There are no knowledge-os accounts or passwords: **identity = the person's GitHub account**, and
protection = GitHub's auth (recommend **2FA / passkeys**, especially for the owner). Practical rules:

- **Second computer, same person:** don't re-onboard — log into the SAME GitHub account and run
  `/kb-setup`; it auto-discovers the person's bases from their account/orgs and connects them.
- **One account per person, never shared.** "Logging in as the CEO" should be impossible because the
  CEO's GitHub credentials are theirs alone (2FA enforced); their restricted base (see below) is
  invitation-only on top of that.
- **The clone lives on disk** — an unlocked laptop exposes it. Recommend OS screen lock + full-disk
  encryption (macOS FileVault: `fdesetup status`); that's what "password-protects" the local copy.
- **Lost/stolen device:** revoke at github.com/settings/sessions (and tokens), remove the device's
  SSH keys; the private repo is then unreachable from that machine.
- Agents must NEVER invent their own password layer or store credentials in the base.

## Confidential knowledge — the repo IS the boundary

Git/GitHub access is per-**repository**; there is no folder-level secrecy inside a shared base.
Anyone who can clone the base (and any agent running on their machine) can read ALL of it. So:

- **Never put secrets in a shared base** — no passwords/keys/tokens, and no knowledge that not every
  collaborator may see (salaries, board/M&A notes, legal disputes, personal data).
- **Restricted knowledge = a separate base (its own repo).** Create it like any base (`/kb-init`,
  e.g. `<company>-knowledge-leadership`) and grant GitHub access only to the right people (CEO,
  board, HR). The machine registry supports many bases side by side: authorized people have both
  bases registered; an employee's agent **physically cannot read** a base that isn't cloned on their
  machine. Access control = GitHub repo permissions — auditable, revocable, standard.
- **Cross-reference by title only.** In the shared base you may note *"details in the leadership
  base"* — never paste restricted content across the boundary.
- **When ingesting, triage first:** if material looks sensitive (salaries, legal, personal data,
  strategy), ask which base it belongs to BEFORE writing anything.
- A `confidential: true` frontmatter flag is **NOT protection** — anyone with the repo can read it.
  Use it at most as a courtesy hint *inside* an already-restricted base.

## Identity, decisions & history (shared base)

- Author from Git, no second source of truth: your author slug comes from `git config user.email` mapped via `roster` in `knowledge.config.json`. Stamp it as `author:` in each article you add, so the file's author matches the commit's author. If your email isn't in the roster, add it.
- `wiki/decisions.md` — append-only log of decisions that shape the base or how the team works (D-NNN: who, decision, why, consequences). Never edit past entries.
- `wiki/log/log-<slug>.md` — your personal append-only activity log; add one line per change. Everyone writes only to their own file → no merge conflicts.
