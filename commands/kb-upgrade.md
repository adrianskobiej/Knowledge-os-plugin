---
description: Upgrade a knowledge base's engine (reindex script, viewer, launcher) to the installed plugin version — content and customizations untouched. Use when the user asks to update/upgrade the base, when install.mjs --list marks a base as outdated, or after the knowledge-os plugin itself was updated.
argument-hint: [base path (optional)]
allowed-tools: Bash, Read, Write, Edit
---

# /kb-upgrade — bring a base's engine up to the installed plugin version

A base gets a COPY of the engine when it is created and never updates itself. This command closes
that gap. It upgrades **engine files only** — never the company's content or customizations.

## What is engine vs. what is theirs (never cross this line)
- **Engine (safe to overwrite):** everything in `scripts/` (`reindex.mjs`, `kb-access.mjs`,
  `kb-build.mjs`, `kb-collect.mjs`, `kb-guard.mjs`, …), `viewer.html`, `kb` (launcher).
  Copy the whole `scripts/` directory — the scripts import each other, and refreshing one
  alone can leave a base with a missing module.
- **Theirs (NEVER overwrite):** all content zones (`projects/`, `people/`, …), `knowledge.config.json`
  (except the `version` field), `AGENTS.md`, `_templates/`, `CONTEXT.md`, `now.md`, `quotes.json`,
  `.gitignore` (append-only, see step 5), `wiki/`.

## Steps
1. **Locate the base.** Use the argument; else if the current directory has `knowledge.config.json`,
   use it; else run `node "${CLAUDE_PLUGIN_ROOT}/install.mjs" --list` — one base → use it; several →
   ask which one (the only question this command ever asks).
2. **Compare versions.** Base `knowledge.config.json → version` vs plugin
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json → version`.
   - Equal → "already up to date", stop.
   - Base newer than plugin → warn (the plugin itself is outdated; update the plugin first), stop.
     Never downgrade.
3. **Safety first.** The base must be a git repo with a **clean working tree** (commit or stash
   pending changes first) so the upgrade is one reviewable, revertible commit. Then
   `git pull --rebase --autostash` so you upgrade the latest state.
4. **Copy the engine files** from `${CLAUDE_PLUGIN_ROOT}/template/`:
   the whole `scripts/` directory, `viewer.html`, `kb` (keep `kb` executable: `chmod +x kb`).
5. **Ensure generated files are gitignored** (newer engines emit new generated files). Append any of
   these lines that are missing to `.gitignore` — do not rewrite or reorder the file:
   `/INDEX.md`, `/INDEX-facets.md`, `/GAPS.md`, `/kb-data.js`, `/*/INDEX*.md`.
   In a department EDITION also keep `!/.kb-edition.json` allowed — kb-collect reads that
   manifest to tell a real edit apart from the link rewriting kb-build does on every publish.
6. **Stamp the version.** Set `version` in `knowledge.config.json` to the plugin version.
7. **Verify.** Run `node scripts/reindex.mjs` — it must complete and the health-check should not
   report new structural errors. If it fails, `git checkout -- .` (revert) and report plainly.
8. **Save.** Commit `Upgrade knowledge-os engine to v<X.Y.Z>` and push (or offer `/kb-deploy`).
   Add one line to `wiki/log/log-<author>.md`.
9. **Tell the user what's new** in 2–3 plain sentences (from the plugin's `CHANGELOG.md` sections
   between their old and new version). If several registered bases are outdated, offer to upgrade
   the others too.
