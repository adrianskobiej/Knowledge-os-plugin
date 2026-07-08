---
description: Onboard a new project into the company base. Use when the user says e.g. "add a new project", "set up project X in the knowledge base", "I'm starting a new project". Interviews the user for the project's description, goal, scope and guardrails, then creates a structured projects/<slug>.md article.
argument-hint: [project name or repo (optional)]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /kb-new-project — onboard a new project (interview, don't stub)

Project: `$ARGUMENTS` (name or repo, if given).

Do NOT silently write an empty stub. Interview the user first, then fill `_templates/project.md`.
Mark anything still unknown as `⚠ TBD` (in English — base content is English only).

1. Read `INDEX.md` (existing projects/people/skills to link to) and `people/` for the owner profile.
2. Ask the user (interactively — use an options/question UI if the tool has one, else a numbered list):
   1. **Name + slug** (kebab-case).
   2. **What it is** — the project in 2–3 sentences.
   3. **Goal** — the outcome; definition of "done".
   4. **Status** — active / on hold / done.
   5. **Repo / dir / URL** — GitHub, path on disk, production URL.
   6. **Stack** — key technologies / services / accounts.
   7. **✅ In scope** — how agents should help.
   8. **⛔ Out of scope (non-goals)** — a HARD boundary; agents do not act there without explicit approval.
   9. **Relations** — `[[slug]]` links to people / other projects / skills.
2b. **Decision lens (alignment check) — before you add it.** A new project is a big commitment, so weigh it
   against the owner's personal context (`people/<owner>-personal.md`): does it fit their **time budget**,
   focus, definition of **"enough"**, and how many projects are already `status: active`? If it pulls
   against a stated want or red line (e.g. *"more family time / fewer projects"* while this would be the Nth
   active project; or it deepens a single-client dependency they named as a red line), **say so in one line
   and ask** — add it, pause another first, or drop it? Surface the tension; the user decides. (No personal
   context yet → skip; offer `/kb-onboard`.)
3. Determine the author slug: `git config user.email` → `roster` in `knowledge.config.json`.
4. Draft `projects/<slug>.md` from `_templates/project.md` with full frontmatter and the answers above.
5. Propose before writing: show the path + content and get an explicit OK.
6. On acceptance, in order: write the file → append one line to `wiki/log/log-<slug>.md` → `node scripts/reindex.mjs` → show the health-check.
