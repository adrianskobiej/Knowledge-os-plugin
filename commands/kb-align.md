---
description: Surface tensions between what the owner/partners personally want and what the company is actually doing. Use when the user asks "are we aligned?", "sprawdź spójność", "gdzie są zgrzyty?", "does what I'm doing match what I want?", "check alignment", or during a monthly review. Compares personal context vs company context + real commitments.
argument-hint: (none, or a person slug to focus on)
allowed-tools: Read, Glob, Grep, Bash, Write
---

# /kb-align — personal ↔ company tension check

Find the **zgrzyty**: where what an owner/partner personally wants pulls against what the company (or they) are actually doing. This is the point of splitting personal and company context — hold them side by side and the contradictions become visible.

## 1. Gather both sides
- **Personal side** — read every `type: PersonalContext` article (`people/*-personal.md`, `visibility: owners`). One per owner/partner. `$ARGUMENTS` = focus on that person only; otherwise all.
- **Company side** — read `CONTEXT.md` (identity, model, business goals), `now.md` (current focus), the **active projects** (`projects/` with `status: active`), the **task board** (`BOARD.md` / `tasks/` — especially who's assigned), and, if present, `autonomy.json` (how much the owner still does vs delegates — a hard signal for the "wants autonomy / does the work" tension).

## 2. Look for tension along these axes
For each owner/partner, compare their personal drivers with the company reality:
- **Life goal ↔ commitments** — e.g. *"more time with family"* / *"weekends off"* vs **7 active projects** or an overloaded board.
- **Stated desire ↔ actual behaviour** — e.g. *"want to earn more autonomously"* vs **tasks assigned to the owner** + a low autonomy score (they're personally doing execution).
- **"Enough"/finish-line ↔ current path** — chasing growth past the point they said was enough.
- **Values / red lines ↔ what's happening** — e.g. *"no burnout"* vs a punishing schedule; a red line being approached.
- **Role wanted ↔ role played** — *"visionary"* vs day-to-day operator.
- **Between partners** (if several) — where their personal motivations **diverge** (one wants a lifestyle business, another wants to scale/sell) — surface it so it's discussed, not assumed.

Base each tension on **evidence** (quote the personal line + point to the company fact/file). Don't invent; if a personal context is thin, note the gap and offer `/kb-onboard`.

## 3. Write `ALIGNMENT.md` (at the base root) and brief the user
Structure it:
- **⚡ Tensions** — most important first. Each: *who · what they want (quote) · what's actually happening (evidence) · why it matters · a question to resolve it* (don't resolve it for them — surface + ask).
- **🤝 Divergences between partners** (only if several owners/partners).
- **✅ Aligned** — where actions genuinely serve stated wants (reinforce these).
- **🔧 Options** — 2–3 concrete moves that would ease the sharpest tension (e.g. delegate project X to an AI worker, pause the 7th project, set a hard weekly cap).

Then tell the user the 1–2 sharpest tensions in plain language and ask which they want to act on. Offer to turn a decision into `now.md` / a board task. Re-run monthly (tie it into the goals ritual — see `/kb-journal`).

> Personal context is **owner/partner only** — never expose it to employees or company-facing agents. If you can't read any `*-personal.md`, tell the user none exist yet and offer `/kb-onboard` to capture one.
