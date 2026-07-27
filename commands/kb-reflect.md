---
description: Distil the base's work memory into LESSONS.md — which sources paid off, which were dead ends, what got corrected. Use at the start of a working session, or when the user asks "what have we learned", "update the lessons", "what actually worked".
argument-hint: (none)
allowed-tools: Bash, Read
---

# /kb-reflect — build LESSONS.md from work memory

1. Aggregate every memory doc in `memory/` (recency-weighted, corroboration-gated):
   ```
   node scripts/kb-memory.mjs reflect
   ```
   Optional knobs: `--half-life 30` (how fast a signal fades, days) · `--min-corroboration 2` (distinct useful hits before a source is "preferred").
2. `Read` the generated `LESSONS.md` and give the user the headline: what's now **preferred**, what's **contested** (mixed signals), and any **dead ends** to avoid re-deriving.
3. Treat `LESSONS.md` as session-start context: **preferred** sources first, **contested** ones with care (recency decides), and never re-walk a **known dead end**.

If `memory/` is empty, tell the user there's nothing to reflect on yet — outcomes get recorded with `/kb-save-result`.
