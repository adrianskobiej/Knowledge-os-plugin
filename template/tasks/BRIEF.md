# Brief: tasks/

Procedure for the `tasks/` zone — the base's built-in project management. Read before adding tasks.

**Goal:** one small file per task (status, assignee, project, due) — the engine compiles them into
`BOARD.md`, a kanban the whole team and every agent can read. One task = one file → many users can
add/update tasks concurrently with no merge conflicts.
**Belongs here:** actionable work items with an owner and a definition of done. **Does NOT belong:**
ideas/lessons (→ `concepts/`), meeting records (→ `meetings/` — but their action items often BECOME
tasks here), project documentation (→ `projects/`).

## How to add (procedure)
1. **Dedup first** — grep `tasks/` (and `BOARD.md`) so the same work isn't tracked twice.
2. Copy `_templates/task.md`. One file = `tasks/<short-slug>.md`. Set `type: Task`.
3. Fill: `status` (todo|doing|blocked|done), `assignee` (people/ slug from the roster),
   `project` (projects/ slug), optional `due` + `priority` (P1–P3). One-sentence `summary` =
   the definition of done.
4. **Status changes = edit the file in place** (todo → doing → done) and bump `updated`. Add a
   one-line progress note in `## Notes / progress`. Old done tasks → `status: archived` to clear them
   out of indexes (still grep-able).
5. Run `node scripts/reindex.mjs` (regenerates `BOARD.md`); log one line in `wiki/log/log-<author>.md`.

## For agents (the base as project manager)
- **Adding:** when a conversation reveals an action item (esp. `/kb-meeting` action items), offer —
  one sentence — to turn it into a task. Never silently.
- **Executing:** asked to "do task X"? Read the task AND its project's article first (respect the
  ⛔ non-goals), do the work, set `status: done` with a progress note, reindex, log.
- **Answering "what's next / my tasks":** read `BOARD.md`, filter by assignee/project; overdue (⏰)
  and P1 first.

## Required frontmatter
`title, slug, category: tasks, type, summary, status, assignee, project, author, created, updated`
(+ optional `due`, `priority`, `tags`, `entities`).
