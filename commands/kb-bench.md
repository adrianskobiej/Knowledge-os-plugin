---
description: Measure how well the base answers questions — retrieval recall@1/3/5 over an eval set. Use when the user asks "how good is the base at finding things", "test retrieval", "benchmark the knowledge base", or after a big content change.
argument-hint: (none)
allowed-tools: Bash, Read, Write
---

# /kb-bench — retrieval-quality benchmark

1. If `eval/questions.json` doesn't exist yet, create it from `eval/questions.example.json` — a list of real questions paired with the slug the base *should* return:
   ```json
   [ { "q": "how do we deploy to production?", "expect": "deployment-runbook" } ]
   ```
   Add 10–30 questions the base is meant to answer (use real slugs from `graph.json` / article paths).
2. Run it:
   ```
   node scripts/kb-bench.mjs
   ```
3. Report **recall@1/3/5** and **MRR**, and list the **misses** (`✗ MISS`). A miss means the right article isn't surfacing for that phrasing — usually a weak `summary`, missing `tags`, or a missing `aka:` synonym. Fix those, rerun, watch recall climb.

This is a health metric like the autonomy benchmark — track it over time; it should go up as the base matures.
