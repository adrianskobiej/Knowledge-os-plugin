---
description: Explain a node in the knowledge graph — what it is, what it connects to, and which community it sits in. Use when the user asks "what connects to X", "explain X in the base", "what's around X", "show me the neighbourhood of X".
argument-hint: <slug or title>
allowed-tools: Bash, Read
---

# /kb-explain — a node and its neighbourhood

Target: `$ARGUMENTS`

1. Run the graph helper (it reads `graph.json` + `kb-data.js`, computes everything deterministically):
   ```
   node scripts/kb-graph.mjs explain "$ARGUMENTS"
   ```
   If it reports `graph.json not found`, run `node scripts/reindex.mjs` first, then retry.
2. Present the result: the node (zone · degree · community), what it connects to, and its community peers. Flag it if it's a 🧭 god node (a hub — changes here ripple widely).
3. If the user wants to go deeper, open the article itself (`Read` the `path` shown) or follow a neighbour with another `/kb-explain`.
