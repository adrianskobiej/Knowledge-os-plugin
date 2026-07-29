---
title: Project name
slug: project-name
category: projects
type: Project                       # OKF type (required by OKF; defaults to the zone if omitted)
# resource: https://…              # OKF: optional canonical URL/repo for the project
# folder: ~/code/project-name      # local working directory — gives the project its own chat channel
#                                  # (./kb chat); agents run there with the base attached
summary: What this project is and which problem it solves — in one sentence (lands in INDEX, decides if the agent opens it).
tags: [status-active, technology]
status: stable
author: your-slug
# optional — provenance (data room); remove "# " to enable:
# source: source (e.g. "Client brief, contract 2026")
# authority: primary    # primary | secondary | derived
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Project name

**What it is:** 2–3 sentences — what this project is.
**Goal:** the outcome; definition of "done".
**Status:** active | on hold | done
**Repo / dir / URL:** path on disk · git repo · production URL
**Stack:** key technologies / services / accounts

## ✅ In scope — how agents should help
- What any agent (Claude Code, Antigravity, Codex, Cowork…) SHOULD do here.
- ...

## ⛔ Out of scope (non-goals — HARD boundary)
> Treat as a hard boundary: do NOT act in these areas without explicit user approval.
- What is out of scope / off-limits for agents.
- ...

## Context
...

## Key decisions
- ...

## Lessons learned (portable) → [[concepts]]
- ...

## Questions it answers
> Optional — the questions/phrasings this article answers, so search-by-meaning hits it even when
> the wording differs from the body.
- e.g. "what is <project>?", "who is it for?", "what must agents NOT touch?"

## Related → [[other-slug]]
- ...
