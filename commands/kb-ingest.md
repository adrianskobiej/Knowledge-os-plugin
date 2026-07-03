---
description: Add/save knowledge to the company base — from a note, document, or raw/ material. Use when the user says e.g. "add this to the knowledge base", "save this entry", "remember this", "capture this". Creates a frontmatter .md article and rebuilds the index.
argument-hint: [path or topic (optional)]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /kb-ingest — compile raw material into the wiki

Material: `$ARGUMENTS` (if empty — review the `raw/` directory).

1. If the material is visual (screenshot, diagram, chart), transcribe it to text first — the base is text the LLM reads.
2. **Dedup & update check (do this before writing anything).** Search by meaning first (`/kb-find`: expand into synonyms/concepts, then grep + `INDEX-facets.md`) for an existing article/section that already covers this. If nothing covers it → add normally. If something does → compare: already there/same → don't duplicate, cite the path; new info adds/changes something → decide which is newer/more authoritative (`updated`/`source`/`authority`), show existing vs new and **ask the user: update or keep?**, then refine **in place** (no duplicate file, no changelog); contradicts → surface the contradiction, don't resolve silently.
3. Scope check — does it belong in the base? Durable knowledge → yes. Project code/data → no (stays in the project). Secrets → never. Junk → discard. **Sensitive material** (salaries, legal, personal data, board/strategy) → ask which base it belongs to BEFORE writing — restricted knowledge lives in a separate, access-limited base (see "Confidential knowledge" in `AGENTS.md`).
4. Read `INDEX.md` (what exists, which slugs to link to) and the target folder's `BRIEF.md` if present (goal, audience, source hierarchy).
5. Identify entities and granularity: one material is often several entities. Per entity decide file vs row — own lifecycle / own owner / someone may need only it → its own `.md` in the right area (`departments/`, `projects/`, `people/`, `concepts/`); a small annotation → a row in a parent article.
6. Extract with a quality filter: keep facts (with their `source`), decisions, and hypotheses (marked as hypotheses). Apply the test "would an LLM querying this in 6 months actually use it?". Drop paraphrase, speculation, raw code, secrets.
7. Determine the author slug: `git config user.email` → `roster` in `knowledge.config.json` → slug. If the email isn't in the roster, ask the user for their slug and add it.
8. Draft each article as `.md` with full frontmatter (model in `_templates/`): accurate one-sentence `summary`, `tags`, `author`, plus `source`/`authority` (`primary`/`secondary`/`derived`) when known. Link related articles via `[[slug]]`.
9. Propose before writing: show the proposed path(s) + content and get an explicit OK. Outsource the thinking, not the understanding.
10. On acceptance, in order: write the file(s) → append one line to `wiki/log/log-<slug>.md` (`YYYY-MM-DD — what was added`) → `node scripts/reindex.mjs` → show the health-check.
11. Protected quotes: if the material has verbatim text to lock (contract clauses, client statements), add it to `quotes.json` and run `node scripts/reindex.mjs --bless-quotes`.
12. Propose moving/archiving the processed source from `raw/` (it stays local — `raw/` is git-ignored).
