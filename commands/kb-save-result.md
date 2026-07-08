---
description: Record how a question or task turned out, so the base learns. Use after you answered something from the base, finished a delegated task, or a Cerber/compliance audit returned PASS/ISSUES. Also when the user says "that worked", "that was a dead end", "actually the right answer was…".
argument-hint: <what happened>
allowed-tools: Bash
---

# /kb-save-result — teach the base from an outcome

Context: `$ARGUMENTS`

Decide the outcome, then record it (one memory doc — folds into `LESSONS.md` on the next `/kb-reflect`):

- **useful** — the cited article(s) answered it well.
- **dead_end** — the base couldn't answer / the lead went nowhere. Saves the next agent from re-deriving it.
- **corrected** — the answer was wrong and the user corrected it; capture the right answer in `--correction`.

Run:
```
node scripts/kb-memory.mjs save --question "<the question/task>" --answer "<short answer or result>" \
  --outcome useful|dead_end|corrected --nodes <slug1> <slug2> [--correction "<right answer>"] --author <name>
```

- `--nodes` are the article slugs you actually used (from their paths / `graph.json`).
- Keep `--question` and `--answer` short and specific.

**Cerber / audit loop (T15):** when a compliance audit finishes, record it here — `PASS` → `--outcome useful` on the audited articles; `ISSUES` → `--outcome corrected` with the fix in `--correction`. That feeds the rework signal straight into `LESSONS.md`.
