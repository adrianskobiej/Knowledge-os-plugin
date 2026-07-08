---
description: Export the base's company (and, for an owner, personal) context to portable files for other AI tools, or import an ai-context-kit personal-context.md / company-context.md into the base. Use when the user says "export my context", "give me a CLAUDE.md / cursor rules with my context", "import my ai-context-kit files", "use my context in ChatGPT/Cursor".
argument-hint: export [tool] | import <path>
allowed-tools: Read, Write, Bash, Glob
---

# /kb-context — port context in/out (ai-context-kit interop)

Interoperates with the two-file convention from [ai-context-kit](https://github.com/nocodework/ai-context-kit)
(`personal-context.md` + `company-context.md`), so the base's context is reusable across ChatGPT, Cursor,
Gemini, etc. — without duplicating it by hand.

## Export
`/kb-context export [claude|cursor|chatgpt|files]`
1. **Company context** = `CONTEXT.md` (+ `now.md` + the active-project one-liners). Always safe to share.
2. **Personal context** (only when the *owner/partner themselves* asks, and only their own):
   `people/<slug>-personal.md`. It's `visibility: owners` — **never** bundle it into company-facing exports.
3. Write the target(s):
   - **files** → `personal-context.md` + `company-context.md` (ai-context-kit shape) in the launch dir.
   - **claude** → append a context block to the tool's `CLAUDE.md`.
   - **cursor** → `.cursor/rules/context.mdc` with the frontmatter directive.
   - **chatgpt** → a single paste-ready block (company only, unless the owner asks to include personal).
Always tell the user exactly what went where, and that personal context stays owner-only.

## Import
`/kb-context import <path-to-ai-context-kit>`
1. Read `company-context.md` → merge business facts into `CONTEXT.md` (identity, model, business goals,
   customer/personas → the relevant zones). Don't blow away existing content — propose a diff, get an OK.
2. Read `personal-context.md` → create/update `people/<slug>-personal.md` from `_templates/person-personal.md`
   (map: goals→"why", values→non-negotiables, constraints→red lines/time). Set `role`, `visibility: owners`.
3. `node scripts/reindex.mjs`, then offer **`/kb-align`** — the whole point of importing the personal side is
   to hold it against the company side and surface tensions.

> Company context is shared; personal context is owner/partner only — keep them apart on export, always.
