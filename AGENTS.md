# AGENTS.md — knowledge-os (toolkit repo)

This repo is the **machinery** for stamping out portable company knowledge bases. It is
designed to be **tool-agnostic** — usable from Claude Code, Codex, Antigravity, or any agent.

## Layout

- `template/` — the knowledge-base scaffold stamped into a new base. Carries its own
  `AGENTS.md`, the `scripts/` engine, `viewer.html`, empty content dirs + `_templates/`,
  and `_ci/` (inert automation templates — never wired up by an install).
- `template/scripts/kb-forget.mjs` — retraction: repairs every reference to an article
  before removing it, so a deletion cannot leave the graph full of dead links.
- `template/scripts/kb-vocab.mjs` — tag/entity hygiene: finds terms that name one idea twice
  and proposes merges. Read-only; it never rewrites an article.
- `template/scripts/kb-access.mjs` · `kb-build.mjs` · `kb-collect.mjs` — the access layer:
  who may read what, publishing a per-department edition, and collecting a team's own
  writing back into the master.
- `tests/` — black-box tests against the shipped engine (`npm test`).
- `commands/` — slash-command sources (one source of truth that `install.mjs` adapts to
  Claude / Codex / Antigravity).
- `install.mjs` — cross-platform installer; adapts commands + sets up global awareness.
  Run `node install.mjs --dry-run` to preview.
- `hooks/` + `scripts/kb-autoindex.mjs` — Claude-only PostToolUse auto-reindex.
- `.claude-plugin/` — Claude Code plugin + marketplace manifest.

## Invariants — keep these true when editing

- **Engine portability:** `reindex.mjs` and `viewer.html` stay zero-dependency and never
  assume a specific agent. Anything Claude-specific lives in `commands/`, `hooks/`,
  `.claude-plugin/` — not in the engine or template.
- **One language:** everything user-facing — including text the engine GENERATES into a
  base, not just static docs — matches the rest of the engine. Content dirs:
  `departments/projects/people/concepts/_templates`.
- **Access is fail-closed:** content with no `visibility:` falls back to the path map in
  `knowledge.config.json` and then to `owners`. Never make an unresolved case default to
  shared — one forgotten field would otherwise publish a payroll note to a whole team.
- **Access control applies to people, not agents:** an agent reads whatever clone sits on
  the machine it runs on. Never add an agent-side permission and call it a boundary.
- **Security:** the Markdown→HTML renderer escapes `& < > " '` and only allows
  `http/https/mailto`/anchor/relative URLs (drops `javascript:`/`data:` to `#`). Don't
  regress this — `viewer.html` injects rendered HTML via `innerHTML`.
- **Generated files** (`INDEX.md`, `kb-data.js`) are git-ignored — never hand-edit.

## Quick checks

```
npm test && npm run lint
cd template && node scripts/reindex.mjs --lint
node install.mjs --dry-run
```
