---
description: Onboard a person into the base with the right context for their role — owner/partner (personal + company context, motivation interview), or employee (role card only, no personal context). Use when the user says "add a co-founder/partner", "onboard me as owner", "add an employee", "dodaj wspólnika", "wprowadź nową osobę", or during first setup.
argument-hint: [name] [owner|partner|employee]
allowed-tools: Read, Write, Edit, Bash
---

# /kb-onboard — role-aware person onboarding

Bring a person into the base with **exactly the context their role needs**. Ask in the base's language; one question at a time; propose the article before writing; then `node scripts/reindex.mjs`.

## Step 1 — Role (decides what to capture)
Ask (or take from `$ARGUMENTS`):
- **owner / partner** → full access + **both** a public profile *and* a private personal context. Partners have the **same rights and access as the owner**.
- **employee** → a role card only. **No personal context** — employees don't get one.

Create the public profile `people/<slug>.md` from `_templates/person.md`, set `role:`, and link relations.

## Step 2a — Owner / partner: the personal interview
Create `people/<slug>-personal.md` from `_templates/person-personal.md` (`visibility: owners`). Interview for the **person's own drivers** — this is what powers `/kb-align`. Ask these (adapt wording; don't invent answers — mark unknowns `⚠`):
1. **Why** — what is this business ultimately *for* in your life? (the real prize, not revenue)
2. **Enough** — what does "enough / made it" look like? How will you know you got there?
3. **Non-negotiables** — what won't you trade for the company's success?
4. **Time & energy** — how many hours/week do you actually *want* to work? Hard boundaries (weekends, holidays)? What drains you?
5. **Role** — what role do you want to play (visionary / operator / executor)? What do you want to *stop* doing?
6. **Life priority now** — what's your main life focus this season, outside the business?
7. **Red lines** — what must never happen?
8. **Money** — what do you need to feel financially safe; what is the money *for*?
9. **3 years** — a good personal scenario 3 years out?

Then run the **company interview once** (shared, not per person) if `CONTEXT.md` is still placeholders: company in one sentence · operating model · **business** goals (measurable) + horizon · current commitments (active projects) · how decisions get made / who owns what · hard business boundaries. Write it into `CONTEXT.md` (company context) and `now.md` (current focus).

**After adding a partner:** offer to run **`/kb-align`** — a second set of personal drivers often reveals divergences worth discussing early.

## Step 2b — Employee: role card only
Fill `people/<slug>.md`: role, department, responsibilities, what to ask them about, working style. **Skip the personal interview and personal context entirely.** Employees read the **company** context (`CONTEXT.md`) but never personal contexts.

## Step 3 — Wrap
`node scripts/reindex.mjs`, log one line in `wiki/log/log-<author>.md`. For an owner/partner, mention they can revisit their personal context anytime and run `/kb-align` to check personal-vs-company alignment (monthly is a good rhythm).

> **Privacy:** personal contexts are `visibility: owners` — shared among owner + partners, never with employees. If the base ever gains employees who can clone the repo, move personal contexts into a partners-only base (separate repo — see AGENTS.md "Confidential knowledge").
