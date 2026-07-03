---
description: Show the task board (kanban) from the knowledge base — all tasks or filtered by person/project. Use when the user asks "show the board", "what's on my plate", "what are we working on", "co mam do zrobienia", "tasks for project X", "what's overdue".
argument-hint: [filter: person / project / status (optional)]
allowed-tools: Bash, Read, Grep, Glob
---

# /kb-board — show the board, fluently

Filter: `$ARGUMENTS` (a person, a project, a status, "overdue" — or nothing = whole board).

1. Read `BOARD.md` in the base (regenerate first if stale: `node scripts/reindex.mjs`).
2. Render for the user **in their language**, adapted to their question — don't dump the raw file:
   - *"what's on my plate?"* / *"what is <person> working on?"* → only tasks where that person is
     among the `assignee`(s) — a task may have several owners; show co-owners on each line. ⏰ overdue
     and P1 first, then by due date.
   - *"tasks for <project>"* → only that project's columns.
   - *"what's overdue?"* → just the ⏰ items, with owners.
   - no filter → compact kanban: `📥 todo / 🔨 doing / 🚧 blocked` with owner + due per line, and a
     one-line summary of ✅ done.
3. End with ONE useful nudge, not a lecture — e.g. *"Task X is overdue — reschedule it, mark it done,
   or want me to take it?"* (offer to execute only when it's genuinely agent-doable; doing a task means
   reading its project article and respecting the ⛔ non-goals).
4. The user can act right from here: "mark X done", "move Y to doing", "assign Z to Anna" → `/kb-task`.

For humans without an agent: the board is also in the viewer (`./kb`) and as plain `BOARD.md` in the base.
