---
description: Show or change the knowledge base's feature toggles (journaling, goals) and settings — anytime, not just at onboarding. Use when the user says "enable journaling", "turn on/off goals", "what's enabled?", "kb settings", or asks about a ritual that is currently disabled.
argument-hint: [feature on/off, or empty to show current settings]
allowed-tools: Bash, Read, Write, Edit
---

# /kb-settings — see & change what's enabled (anytime)

Input: `$ARGUMENTS` (empty = show; otherwise infer the toggle from the phrasing).

## Show (no arguments)
Read `knowledge.config.json` and render, in the user's language, a short table:
- **journal** — ✅ on / ❌ off / ➖ not set → daily check-in + weekly planning (`/kb-journal`)
- **goals** — ✅ on / `"professional"` (no private section) / ❌ off / ➖ not set → monthly goals & review
- plus: content language (`company.language`), engine `version`, base path.
(The same view lives in the viewer: `./kb` → **⚙️ Settings**.) End with: *"Want to change any of these?"*

## Change
1. Map the request to a key: journaling/check-ins → `features.journal`; monthly goals → `features.goals`
   (private goals off but professional on → `"goals": "professional"`).
2. Edit `knowledge.config.json` → `features` (create the object if missing). Never touch other keys.
3. Run `node scripts/reindex.mjs` (the viewer's ⚙️ Settings reflects it) and confirm in one line —
   when **enabling**, offer to start right away (e.g. *"Journaling is on — want to do today's
   check-in now?"*; enabling goals near month start → offer `/kb-journal month-start`).
4. One line in `wiki/log/log-<author>.md`; the change is shared with the team on the next `/kb-deploy`.

## Discovery (don't let features rot unused)
If the user asks for something a DISABLED feature provides (e.g. "let's do my check-in" while
`journal: false`), don't refuse — say the feature is off and offer to enable it (one sentence).
A feature that was declined at onboarding can always be enabled here later. Personal opt-outs
(one person in a team base) → note in their `people/` profile instead of the company config.
