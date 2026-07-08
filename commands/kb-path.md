---
description: Find the shortest chain of [[links]] connecting two concepts in the knowledge base. Use when the user asks "how are X and Y related", "what connects X to Y", "is there a path between X and Y", "how do I get from X to Y".
argument-hint: "<concept A>" "<concept B>"
allowed-tools: Bash, Read
---

# /kb-path — shortest link path between two concepts

Endpoints: `$ARGUMENTS`

1. Run the graph helper (deterministic BFS over `graph.json`):
   ```
   node scripts/kb-graph.mjs path $ARGUMENTS
   ```
   Pass both endpoints (quote multi-word ones). If `graph.json` is missing, run `node scripts/reindex.mjs` first.
2. Present the chain hop by hop. Each hop is a real `[[wikilink]]`, so the path is the actual reasoning trail — not a guess.
3. If there is no path, say so plainly: the two concepts live in disconnected parts of the base, which usually means a missing link worth adding (offer `/kb-task` to note it).
