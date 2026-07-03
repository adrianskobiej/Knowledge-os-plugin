---
title: How to use this knowledge base
slug: how-to-use-this-base
category: concepts
type: Reference
summary: The always-there user guide — how to talk to the assistant, every /kb-* command, the visual viewer, and where restricted knowledge belongs. Start here if you're new.
tags: [help, reference, guide, commands]
aka: [help, instructions, manual, how to, commands, cheat sheet]
status: stable
author: knowledge-os
created: 2026-06-30
updated: 2026-06-30
---

# How to use this knowledge base

**You don't need commands — just talk to your assistant:**

| Say (any phrasing, your language) | What happens |
|---|---|
| "What do we know about \<client/topic\>?" | It looks it up in the base |
| "Remember this / save this" (+ paste anything) | It distills it into the base |
| "We had a meeting with \<client\>" (+ notes) | It saves decisions & action items |
| "We're starting a new project \<name\>" | Short interview, project set up |
| "Add a task / what's on my plate?" | Manages the team's kanban board |
| "Let's do my check-in / goals for the month" | Runs your journaling rhythm (day/week/month) |
| "Anything new from the team?" | Pulls the team's latest updates |
| "How do I use this?" | Shows this guide |

**Browse it yourself (no assistant needed):** run `./kb` in the base folder — a visual browser of
all the company's knowledge. `GAPS.md` lists what's still incomplete or unverified.

## All commands (optional precision)

| Command | What it does |
|---|---|
| `/kb-query <question>` | Answer a question from the base, citing sources |
| `/kb-find <term>` | Precise lookup — by meaning, tag, or client/entity |
| `/kb-ingest [material]` | Save knowledge (checks for duplicates first) |
| `/kb-meeting [notes]` | Save a meeting: decisions + action items, client tagged |
| `/kb-task [description]` | Add / assign / complete a task on the board |
| `/kb-board [filter]` | Show the kanban (all, by person, by project, overdue) |
| `/kb-journal [day\|week\|month-start\|month-end]` | Daily check-in, weekly plan, monthly goals & review |
| `/kb-new-project [name]` | Onboard a new project (short interview) |
| `/kb-sync` | Pull the team's latest updates |
| `/kb-deploy` | Save & share your changes with the team |
| `/kb-stats` | Base statistics (articles, authors, drafts, stale) |
| `/kb-lint` | Health-check (missing fields, dead links, duplicates) |
| `/kb-setup` | Set up / connect the base on a (new) computer |
| `/kb-upgrade` | Update this base's engine after a plugin update |
| `/kb-help` | One-screen cheat sheet, in your language |

## Good to know

- **One habit that pays off:** after a meeting or a decision, tell the assistant — 30 seconds of
  "save this" keeps the whole company's memory sharp.
- **Sensitive knowledge** (board, salaries, legal, personal data) does NOT belong here — it lives in
  a separate, access-restricted base. Ask the assistant if unsure; it will ask before saving anything
  sensitive. See "Confidential knowledge" in `AGENTS.md`.
- Full rules for assistants live in `AGENTS.md`; per-folder procedures in each zone's `BRIEF.md`.
