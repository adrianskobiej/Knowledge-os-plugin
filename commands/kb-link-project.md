---
description: Wire a project repo to its knowledge-base article so every agent opening that project instantly loads the right context (goal, status, hard non-goals). Use when the user says "link this project to the base", "make agents here read the KB", or right after onboarding a project that has a repo.
argument-hint: [project dir (default: current dir)]
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# /kb-link-project — instant context when an agent opens the project

Goal: an agent that opens this project should reach the right knowledge in ONE hop — the project's
article (goal, ✅ in-scope, ⛔ non-goals) plus the base's standing context — without being told.

1. **Identify the project directory** (argument, else current dir). It must be a real project — not
   inside a knowledge base (no `knowledge.config.json` walking up).
2. **Find the matching article.** Grep the base's `projects/` for the project's git remote URL
   (`git remote get-url origin`), directory name, or product URL (articles carry `resource:` and
   repo lines). Ambiguous → ask which article. None → offer `/kb-new-project` first, then continue.
3. **Write a managed pointer block** into the project's agent instruction files — `AGENTS.md` always
   (tool-agnostic), and `CLAUDE.md` too if it exists. Use idempotent markers
   `<!-- knowledge-os:begin -->` / `<!-- knowledge-os:end -->` (replace if present, append if not):

   > ## Knowledge base context — read first
   > This project is documented in the company knowledge base:
   > - **Project article:** `<base>/projects/<slug>.md` — goal, status, ✅ in-scope and
   >   **⛔ non-goals (HARD boundaries — do not act there without explicit approval)**.
   > - **Standing context:** `<base>/CONTEXT.md` (owner, goals) and `<base>/now.md` (current focus).
   >
   > Read the article before working here and respect its non-goals. Save durable knowledge you
   > produce back to the base (rules: `<base>/AGENTS.md`) — never copy project code into it.

4. **Make it bidirectional.** Ensure the article's `resource:`/Repo line points at this repo/dir —
   fill it if it was missing (that's what auto-matching greps for).
5. **Don't commit the project repo yourself** — it may have its own workflow; tell the user the file
   is ready to commit. Reindex the base if you edited the article, and add one line to
   `wiki/log/log-<author>.md`.
