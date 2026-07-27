---
description: Retract an article and repair every reference to it, instead of leaving dangling links behind. Use when the user says "this is wrong/outdated, remove it", "we replaced this with X", "delete that note", "retract", or when two articles are merged and one must go.
allowed-tools: Bash, Read, Edit, Glob, Grep
---

# /kb-forget — retract, don't just delete

Deleting the file is the easy half. The base is a link graph, so a plain `rm` leaves every
`[[reference]]` dangling: reindex reports each as a dead link, nobody fixes them, and once the
lint is noisy people stop reading it. **Bases rot from retractions nobody finished.**

## Run it

```
node scripts/kb-forget.mjs <slug>                        # preview — writes nothing
node scripts/kb-forget.mjs <slug> --replaced-by <slug>   # redirect references
node scripts/kb-forget.mjs <slug> --apply
```

Always show the preview to the user first. It lists every file that will be touched and how
many links and relations each one carries.

## Which of the two retractions

- **Superseded by something** → `--replaced-by <slug>`. References are redirected with their
  original wording kept (`[[new|old label]]`), matching `depends_on`/`supersedes` entries are
  repointed, and the replacement records `supersedes:` so the trail outlives the deleted file.
  **Prefer this whenever a successor exists** — a redirect keeps the reader moving.
- **Simply wrong or obsolete** → no flag. References become plain text marked `(retracted)`,
  which reads honestly and leaves the sentence intact.

## Before you retract

1. **Check what depends on it** — `node scripts/kb-graph.mjs links <slug>`. An article with
   many `depends_on` edges pointing at it is load-bearing; say so and ask before removing.
2. **Never retract to resolve a contradiction.** If two articles disagree, that tension is
   information — surface it, let the user decide which is true. Deleting one hides the conflict
   rather than settling it.
3. **Git is the history.** The file stays recoverable in git; the base does not need a tombstone.

## Typed relations

Three flat frontmatter fields carry meaning a bare `[[link]]` cannot:

```yaml
supersedes: [old-slug]        # this replaced that
superseded_by: newer-slug     # that replaced this
depends_on: [a, b]            # this breaks if those change
```

Add them when the relationship is a **fact someone will act on**, not just an association —
`[[links]]` already cover "these are related". `--lint` flags a relation pointing at nothing,
because tooling follows these and a stale one sends a reader nowhere.

## Hard rules

- ⛔ Never run `--apply` without showing the preview and getting an OK.
- ⛔ Never point `--replaced-by` at an article that does not exist (the script refuses).
- ⚠ Run `node scripts/reindex.mjs` afterwards — index, facets and graph all change.
