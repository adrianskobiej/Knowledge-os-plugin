---
description: Create a new company knowledge base or connect an existing repo. Use when the user says e.g. "create/set up a knowledge base", "connect a knowledge repo", "new base for the company".
argument-hint: [company-slug] [repo-url (optional)]
allowed-tools: Bash, Read, Write, Edit
---

# /kb-init — create or connect a knowledge base

Arguments: `$ARGUMENTS` (e.g. `acme` or `acme git@github.com:acme/knowledge.git`)

Goal: prepare an independent company knowledge base in `~/knowledge/<slug>`. Each company = a separate repo.
(The same flow also creates a **restricted base** — e.g. `<company>-knowledge-leadership` for
CEO/board/HR-only knowledge: just limit the GitHub repo access. Access control = repo boundary;
see "Confidential knowledge" in `AGENTS.md`.)

Steps:
0. **Detect first.** Before creating anything, check whether a base already exists on this machine —
   including one set up by a different tool (Claude Code / Codex / Antigravity share one registry):
   `node "${CLAUDE_PLUGIN_ROOT}/install.mjs" --list` (JSON: `bases`, `toolsDetected`, `adaptersInstalled`).
   If a base is found and no repo URL was given, don't create a duplicate — offer to connect this tool to
   it instead: `node "${CLAUDE_PLUGIN_ROOT}/install.mjs"` (installs `/kb-*` for detected tools + refreshes
   awareness), then go to step 9. Only proceed to create/clone if the user explicitly wants a different base.
1. Determine the company `slug` (1st argument; if missing — ask). Target directory: `~/knowledge/<slug>`.
2. The template ships with the plugin in `${CLAUDE_PLUGIN_ROOT}/template/`. If the variable is empty (running from a clone, not an install), use `template/` in the `knowledge-os` repo.
3. **Decide NEW vs JOIN** (this gates which questions you ask). If a repo URL is given (2nd argument):
   - `git clone <url> ~/knowledge/<slug>`.
   - If the repo is empty or has no `knowledge.config.json` → it's **NEW**: stamp it with the template (step 4).
   - If it already has a base → it's a **JOIN**: skip stamping, **inherit the existing config**, go to step 6.
   Without a URL: it's **NEW** — create the directory and stamp it with the template.
4. Stamp: copy the template contents into the base directory. Do not copy the generated `INDEX.md` or `kb-data.js`.
5. Config — depends on NEW vs JOIN:
   - **NEW base:** ask for the **company name** and the **preferred content language** ("In which language
     will entries be written?"). Set `company.name`, `company.slug=<slug>`, `company.language=<lang>` (the
     default everyone who joins later inherits), `remote=<url>` if any; adjust `departments` if needed.
     Also set `version` to the installed plugin version (read it from
     `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`; fall back to the template's value) so the base
     records which engine version created it. Then seed `CONTEXT.md` (owner, company, language, a line on
     goals / how to work) and leave `now.md`.
   - **JOIN:** **inherit** `company.name`, `departments` and `company.language` from the existing config —
     do NOT re-ask or overwrite them, and don't touch `CONTEXT.md`/`now.md`.
6. Ask for your handle and role → create `people/<handle>.md` from `_templates/person.md`, and add your git
   email → handle to the `roster` in `knowledge.config.json` (so your entries are attributed to you). Set
   `external: true` if you are an external consultant. (Your entries default to `company.language`; you may
   still write in your own language — mixed languages are fine.)
7. Run `node scripts/reindex.mjs` in the base directory.
8. Register the base globally so the agent in EVERY project knows it exists: `node "${CLAUDE_PLUGIN_ROOT}/install.mjs" --base ~/knowledge/<slug>` (writes a registry + a pointer into each tool's global instructions). Optionally install the universal auto-reindex: `node scripts/reindex.mjs --install-git-hook`.
9. Show: the base path, the article count, the command to open `viewer.html` (e.g. `open ~/knowledge/<slug>/viewer.html`).
10. **Then onboard the owner conversationally (don't stop at "base ready").** For a NEW base, offer to
    capture their goals, how they work (→ profile + `CONTEXT.md`), this week's focus (→ `now.md`), and
    their active projects via `/kb-new-project` — so the base starts with real content, not empty zones.
    (`/kb-setup` does this hand-held; `/kb-init` users can be offered it more briefly.)

Do not commit automatically — that is what `/kb-deploy` is for.
