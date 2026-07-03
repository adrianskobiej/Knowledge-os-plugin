---
description: Save a meeting into the knowledge base — the user pastes notes/a transcript or describes the meeting, the agent distills decisions and action items and tags the client. Use when the user says "we had a meeting", "save these meeting notes", "call with <client>", or pastes meeting notes.
argument-hint: [notes / transcript / short description (optional — can paste after)]
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# /kb-meeting — capture a meeting in one paste

Input: `$ARGUMENTS`. If empty, ask for ONE thing: *"Paste your notes/transcript, or describe the
meeting in 2–3 sentences."* That's all the user should have to do — you do the rest.

Goal: one small article per meeting worth remembering — **decisions + action items**, not transcripts.

1. **Distill, don't dump.** Extract: topic, date (default today), attendees, 1–2 lines of context,
   **Decisions**, **Action items** (owner + due when known), a few key notes. Drop chit-chat. Never
   store the raw transcript in the base (it can stay in `raw/`, which is local-only).
2. **Dedup-first.** A follow-up to an existing meeting/topic → offer updating that article instead of
   creating a new file.
3. **Tag the client — this is the superpower.** Put the client/company/product discussed into
   `entities: [client-name]` and attendees into `attendees:`. That's what later answers
   "show me everything about <client>" (facets / `/kb-find`). If an external person keeps appearing,
   offer a `people/` profile (`external: true`).
4. Write `meetings/meeting-<topic>-<YYYY-MM-DD>.md` from `_templates/meeting.md`, in the base's
   content language. Propose → OK → write.
5. Ripple the important bits: a decision that changes how the company works → also `D-NNN` in
   `wiki/decisions.md`; an action item that IS the user's current focus → offer updating `now.md`.
6. `node scripts/reindex.mjs` + one line in `wiki/log/log-<author>.md`. Offer `/kb-deploy` so the
   team gets it.

**Proactive rule:** whenever the conversation reveals a meeting happened (the user recounts a call,
pastes notes), offer this once, in one sentence: *"Want me to save this meeting to the base?"*
