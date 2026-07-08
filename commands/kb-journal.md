---
description: Run the AI-journaling ritual — daily check-in ("what did I do today, what blocked me"), weekly planning (agree the top tasks), monthly goals & review (professional/private). Use when the user says "let's do my check-in", "podsumujmy dzień/tydzień", "set goals for the month", "monthly review" — or offer the daily check-in yourself on the first conversation of the day (if features.journal is enabled).
argument-hint: [day | week | month-start | month-end (default: day)]
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# /kb-journal — daily check-in · weekly plan · monthly goals & review

Mode: `$ARGUMENTS` (default **day**; infer from phrasing — "goals for July" = month-start,
"how did the month go" = month-end). **First check `features` in `knowledge.config.json`:**
if `journal: false` never offer this; if `goals: false` skip goal-setting; if `goals: "professional"`
skip the Private section. The user can flip these anytime by asking. Full conventions: `journal/BRIEF.md`.

**Best practices (all modes):** 3 short questions, not 10 — everything skippable; specifics over
adjectives; blockers are the most valuable answer; NEVER judge or guilt-trip about gaps; end with one
concrete next step, in the user's language.

## day (~3 min) — offer once on the first conversation of the day
Ask one at a time: **What did you get done today?** → **Anything block you or slow you down?** →
**One win or lesson?** → **What's the #1 thing for tomorrow?**
Then, silently: write `journal/<person>/<YYYY-MM-DD>.md` from `_templates/journal-day.md`
(one-line `summary` = the day's headline) and **sync the board**: things described as done → find the
task, `status: done` + note; blockers → `status: blocked` + note (offer a task if untracked); new work
mentioned → offer `/kb-task`. **Recurring tasks (`recur:`)** completed today → don't close: bump `due`
to the next period and add a progress note. Reindex, one-line log. Reply with a 2-line reflection —
connect to the month's goals when relevant.

## week (~10 min) — e.g. Monday, or "plan the week"
1. Read `BOARD.md` + this week's `journal/<person>/` entries.
2. Reflect in 3 bullets: shipped 🎉 · stuck (recurring blockers) · stale tasks (propose drop/archive).
3. **Agree the top 3 for next week together** — user decides, you propose from goals + board.
4. Apply: update `now.md` (priorities), board tasks (priority/due), note one line in today's entry.

## month-start — set the month's goals
**Owner/partner first — run `/kb-align`.** Surface the tensions between their personal context (what they
*want*: time budget, "enough", red lines) and what the company is *doing* (active projects, board,
`finance.json`), so the month's goals are set against the real **zgrzyty**, not just the board. Name the
sharpest tension in one line before goal-setting. (Employees / no personal context → skip.)
Then: ask for **3–5 most important goals**, split **💼 Professional / 🏠 Private** (respect `features.goals`).
Push for sharp, checkable goals; link them to board tasks ([[slug]]) or offer to create the key tasks.
Write `journal/<person>/goals-<YYYY-MM>.md` from `_templates/goals-month.md`; reflect the top ones in
`now.md`. Reindex, log.

## month-end — review
1. Read the month's goals file + board (done vs open) + skim the month's entries.
2. Walk through each goal: **achieved / not / partly** — ask "why" only where it helps next month.
3. Fill the `## 📊 Month-end review` section IN the goals file; carry-overs → tasks or next month's
   goals (offer `month-start` for the new month right after). Reindex, log.
