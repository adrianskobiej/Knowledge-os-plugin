---
description: Add, update, assign or complete a task on the knowledge base's board. Use when the user says "add a task", "assign X to Y", "mark X as done", "I'll do that tomorrow", or an action item emerges in conversation. One task = one small file; the board (BOARD.md) regenerates automatically.
argument-hint: [task description / "done: <task>" / "assign <task> to <person>"]
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# /kb-task — add / update / complete a task

Input: `$ARGUMENTS`. Figure out the intent: **new task**, **status change** (done/doing/blocked),
**reassign**, or **edit** (due/priority). Keep the user's effort near zero — infer, confirm in one line.

## New task
1. **Dedup:** grep `tasks/` + `BOARD.md` — if the same work is already tracked, update that file instead.
2. Infer from conversation (ask ONLY for what's missing, one short question): title (imperative),
   definition of done (= `summary`), `project` (match against `projects/` slugs — auto-detect from the
   current repo if you're inside a linked project), `assignee` (roster slug; default: the current user;
   may be an agent's author slug if the user delegates it to you), optional `due` / `priority`.
3. Write `tasks/<short-slug>.md` from `_templates/task.md` (in the base's content language) →
   `node scripts/reindex.mjs` (BOARD.md updates) → one line in `wiki/log/log-<author>.md`.
4. Confirm in one line: *"Added to the board: <title> → <assignee>, <project><, due X>."*

## Status change / reassign / edit
1. Find the task (grep `tasks/` by words from the user's phrasing; ambiguous → ask which one).
2. Edit the file in place: `status:` (todo|doing|blocked|done), `assignee:`, `due:`, `priority:`;
   bump `updated:`; append a dated line to `## Notes / progress` (e.g. "done — <one-line outcome>").
3. Reindex + one-line log. If the user asks you to DO the task: read its project article first and
   respect the ⛔ non-goals, do the work, then mark it done with the outcome note.

## Proactive rule
When a conversation (or `/kb-meeting` action items) reveals actionable work, offer once, in one
sentence: *"Want me to put that on the board?"* Don't nag; never add silently.
