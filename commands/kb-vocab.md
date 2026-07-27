---
description: Find tags and entities that name the same idea twice — misspellings, plurals, mixed-language duplicates — and propose merges. Use when the user says "check the tags", "clean up the vocabulary", "why does search miss things", "are we tagging consistently", or before a big ingest.
allowed-tools: Bash, Read, Edit, Glob, Grep
---

# /kb-vocab — one idea, one name

Facets only work when a concept has a single name. Left alone a base drifts: `website`,
`websites` and `www` become three separate facets, and a query that asks for one misses the
other two. The usual workaround is to make the model guess synonyms at query time — this
attacks the cause instead.

## Run it

```
node scripts/kb-vocab.mjs
```

Reports four things: terms that differ only in spelling or diacritics (certain duplicates),
near-variants (likely one idea), tags outside `vocabulary.json` if that file exists, and tags
used exactly once.

## Then propose, never bulk-rename

The script is read-only on purpose — picking the canonical term is an editorial call. Bring
the user a **table** of `variant → suggested canonical → how many articles`, ordered by how
many files each merge touches, and get an explicit OK. Then apply with targeted edits and
run `node scripts/reindex.mjs`.

- **Keep the higher-count term** unless the user says otherwise: fewer files to touch, and
  the popular spelling is usually the intended one.
- **A cluster is a suggestion, not a verdict.** Real distinctions do get flagged —
  `agenci` (people) vs `agency` (the company kind) look like variants and are not. Ask
  before merging anything whose meanings could differ.
- **Never merge a numbered series** (`etap-0`…`etap-9`) or a narrower compound
  (`leads-method` is not a typo of `ads-method`). The script already skips these; do not
  reintroduce them by hand.

## Tags used once

A tag on a single article is not a facet — it is a note. Do not mass-delete them: offer to
fold the obvious ones into an existing tag, and leave the rest. A term used once today may
be the right name for a cluster next month.

## vocabulary.json (optional)

Copy `_templates/vocabulary.json` to the base root to declare canonical tags, aliases and
entity types. Keep it small and specific — a large imported vocabulary matches everything and
therefore says nothing. Add a term when it has earned its place.

## Hard rules

- ⛔ Never rewrite tags across the base without showing the merge table and getting an OK.
- ⛔ Never invent a canonical term that appears nowhere in the base; pick from what exists.
- ⚠ After any merge, run reindex — facets, the graph and the viewer all read from tags.
