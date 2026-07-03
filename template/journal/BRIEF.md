# Brief: journal/

Procedure for the `journal/` zone — AI journaling: daily check-ins, weekly planning, monthly goals &
reviews. The agent runs the ritual conversationally (`/kb-journal`); this brief defines what lands here.

**Goal:** a lightweight rhythm that compounds: each person logs what happened and what blocked them;
weekly the top priorities are re-set; monthly, goals are set (private/professional) and reviewed.
**Belongs here:** daily entries, monthly goals & reviews — **one file per person per entry** (no merge
conflicts). **Does NOT belong:** tasks (→ `tasks/`, but check-ins UPDATE the board), meeting records
(→ `meetings/`), durable knowledge (→ distill to the right zone).

## File conventions
- Daily entry: `journal/<person>/<YYYY-MM-DD>.md`, slug `jrnl-<person>-<YYYY-MM-DD>`, `type: Journal`.
- Monthly goals + review: `journal/<person>/goals-<YYYY-MM>.md`, slug `goals-<person>-<YYYY-MM>` —
  goals written at the start of the month, the review appended IN the same file at the end.
- Weekly planning writes no separate file — it updates `now.md` (top priorities) and the board
  (`tasks/`: priorities, due dates); note one line in the day's entry.

## The rhythm (agent-run, see /kb-journal — respect `features` in knowledge.config.json)
- **Daily (~3 min):** what got done · what blocked you · one win/lesson · tomorrow's #1. The agent
  syncs the board: mentioned-as-done → `status: done`; blockers → `status: blocked` + note; new work →
  offers tasks. Recurring tasks (`recur:`) roll forward instead of closing.
- **Weekly (~10 min):** review the board + the week's entries → celebrate done, drop stale, agree the
  top 3 for next week → update `now.md` + board priorities.
- **Monthly:** start = set goals (sections: Professional / Private — only if `features.goals`);
  end = review in the same file (achieved / not / carry-over → tasks).

## Journaling best practices (bake into the conversation)
- Short beats complete — 3 questions, not 10; skip freely; no guilt about gaps.
- Specifics over adjectives ("closed the Acme offer" not "productive day").
- Blockers are the most valuable line — they feed the board and the weekly plan.
- The agent NEVER judges; it reflects, connects to goals, and offers next steps.

## Required frontmatter
`title, slug, category: journal, type: Journal, summary, status: stable, author, created, updated`
(daily entries also: `date`; goals files: `month`).
