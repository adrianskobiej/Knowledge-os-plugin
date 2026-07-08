---
description: Show a knowledge-base article's impact — what references it (backlinks) and what it links out to. Use when the user asks "what references X", "what depends on X", "what breaks if I change X", "what points to X", "impact of X".
argument-hint: <slug or title>
allowed-tools: Bash, Read
---

# /kb-links — impact of an article (backlinks + outgoing links)

Target: `$ARGUMENTS`

1. Run the graph helper:
   ```
   node scripts/kb-graph.mjs links "$ARGUMENTS"
   ```
   If `graph.json` is missing, run `node scripts/reindex.mjs` first.
2. Present two lists:
   - **← Referenced by** — the articles that link *to* this one. If you edit or remove this article, these are the ones to review (they may go stale or dead-link).
   - **→ Links out to** — what this article points at; any `⚠ dead link` here is a broken reference to fix.
3. Use this before editing a hub (a 🧭 god node): a wide backlink list means the change ripples. Offer `/kb-lint` if dead links show up.
