# START HERE — install in 2 steps

You don't need to be technical. The assistant does all the work for you. Your job: do step 1, then type one command from step 2 and answer simple questions.

## Step 1 — Install the plugin (once per computer)

**In the Cowork app:** find **knowledge-os** in the plugin list and click "Install".

**In Claude Code (terminal):** type these two lines, one at a time:

```
/plugin marketplace add ~/knowledge-os
/plugin install knowledge-os
```

## Step 2 — Tell the assistant to set up the base

Just type:

```
/kb-setup
```

That's it. From here the **assistant takes the wheel**:
- it checks what's needed and installs it for you,
- connects you to the company knowledge base (or creates a new one if you're the first person),
- personalizes it for you,
- opens the knowledge window in your browser.

You just answer simple questions (e.g. "what's your name?", "does anyone at the company already use this?") and maybe click "log in" in the browser.

---

### What next?

- **Want to look something up?** → `/kb-query your question`
- **Have a note/document to save?** → paste it and ask to add it (`/kb-ingest`)
- **Want the latest knowledge from the team?** → `/kb-sync`
- **Need a teammate to see only their department's knowledge?** → `/kb-edition`

Full project description: see `README.md`.
