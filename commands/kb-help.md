---
description: Show how to use the knowledge base in plain language — a friendly one-screen cheat sheet. Use when the user asks "how do I use the base", "what can the knowledge base do", "kb help", or seems unsure how to work with it.
allowed-tools: Read, Bash
---

# /kb-help — how to use the base (one screen, their language)

Render this for the user **in their language**, short and friendly (adapt freely — don't dump verbatim):

**You don't need commands — just talk to me:**
- *"What do we know about <client/topic>?"* → I'll look it up in the base.
- *"Remember this / save this"* (+ paste anything) → I'll distill it into the base.
- *"We had a meeting with <client>"* (+ notes) → I'll save the decisions and action items.
- *"We're starting a new project <name>"* → I'll ask a few questions and set it up.
- *"Anything new from the team?"* → I'll pull the latest updates.
- *"Add a task / what's on my plate?"* → I'll manage the team's task board (kanban).
- *"Let's do my check-in / plan the week / goals for the month"* → I'll run your journaling rhythm.

**Browse it yourself (no agent needed):** run `./kb` in the base folder — a visual browser of all the
company's knowledge. `GAPS.md` lists what's still incomplete.

**The one habit that pays off:** after a meeting or a decision, tell me — 30 seconds of "save this"
keeps the whole company's memory sharp. I'll also offer it myself when I notice something worth keeping.

**Power commands (optional, for when you want precision):** `/kb-query`, `/kb-find`, `/kb-ingest`,
`/kb-meeting`, `/kb-task`, `/kb-board`, `/kb-journal`, `/kb-new-project`, `/kb-sync`, `/kb-deploy`, `/kb-stats`, `/kb-lint`, `/kb-upgrade`.

End with one question: *"Want to try? Tell me something worth remembering, or ask me anything about
the company."*
