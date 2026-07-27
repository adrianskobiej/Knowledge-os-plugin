---
description: Publish a per-department edition of the base, or collect a team's writing back into it.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

# /kb-edition — department editions

One master base, one repo per department. Everyone keeps working in the master; each team gets
a partial copy containing company-wide knowledge plus its own department, and nothing else.

**The subject of access control is a PERSON, never an agent.** An agent reads whatever clone sits
on the machine it was started on, so its reach is already its human's reach. Never propose an
"agent permission" as a boundary — the boundary is which repo landed on whose disk.

## Modes

**1. Status** (no argument) — report what this machine reaches and how the base is classified:

```
node scripts/kb-access.mjs
node scripts/reindex.mjs --lint | grep -i visibility
```

**2. Publish down** (`/kb-edition build <dept> [outdir]`):

```
node scripts/kb-build.mjs --dept <dept> --out ../kb-<dept> --dry    # preview first
node scripts/kb-build.mjs --dept <dept> --out ../kb-<dept>
```

Always run `--dry` first and show the counts (kept / withheld / rewritten links) before writing.
If `withheld` is 0, stop and say so — it almost always means the base is unclassified and
everything defaulted the wrong way, not that everything is public.

The edition is a normal base: `git init`, commit, push to its own **private** repo, then grant
GitHub access to that team. **Never force-push an edition** — it also holds the team's commits.

**3. Collect up** (`/kb-edition collect <dept> [fromdir]`):

```
node scripts/kb-collect.mjs --dept <dept> --from ../kb-<dept> --dry
node scripts/kb-collect.mjs --dept <dept> --from ../kb-<dept>
```

Three gates, all fail-closed — path ownership, no self-promotion to `company`, secret scan. A
breach rejects the whole batch and exits 1. **Never work around a rejection** by hand-copying the
files: report what was rejected and why, and let the owner decide.

## Classifying the base

Reach comes from `visibility:` in frontmatter, falling back to `access.paths` in
`knowledge.config.json`, falling back to `owners`. When adding articles, set it explicitly:

```yaml
visibility: company                     # everyone in the roster
visibility: department                  # needs department:
department: sales
visibility: owners                      # owner + partners only (default)
```

Before a first rollout, walk the base zone by zone and propose a classification **as a table for
approval** — do not set `visibility:` in bulk on your own judgement. Getting this wrong is how
payroll notes reach the sales team.

## Hard rules

- ⛔ Never widen an article's reach without the owner's explicit say-so.
- ⛔ Never suggest `sparse-checkout` or a `confidential:` flag as protection. Neither restricts
  reads; the repo is the only boundary.
- ⚠ Reclassification is not retroactive: an article already shipped as `company` stays in that
  edition's git history even after you change it to `owners`. Flag this as an incident.
