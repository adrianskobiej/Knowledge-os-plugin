---
description: Capture a web source (arXiv paper, article, PDF link) into the base's raw/ staging area, ready to distil. Use when the user shares a URL and says "add this to the base", "save this paper/article", "zapisz ten link", "wrzuć to do bazy", "dodaj ten artykuł".
argument-hint: <url> [--tags a,b] [--author name]
allowed-tools: Bash, Read
---

# /kb-add — capture a web source into raw/

URL: `$ARGUMENTS`

1. Fetch and save it (the script validates the URL, caps size, and runs the secret guard before writing):
   ```
   node scripts/kb-add.mjs $ARGUMENTS
   ```
   - arXiv → title, authors, abstract. Webpage → readable text. `.pdf` → a pointer stub (full PDF text extraction is a pro feature).
   - If it refuses with **secret-like value(s)**, do NOT `--force` blindly — open the source and check; forcing pulls a possible key into the base.
2. `Read` the saved `raw/<slug>.md` and tell the user what landed.
3. It's a **draft in `raw/`**, not knowledge yet. Offer to distil it into the right zone with **/kb-ingest** (projects / concepts / research …), then the raw capture can be deleted.
