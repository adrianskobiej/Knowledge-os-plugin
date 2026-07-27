# _ci — automation templates for department editions

These are **templates, not active workflows**. Copy the one you want into `.github/workflows/`
in the right repo and fill in the placeholders. They are kept here, inert, so that installing
a base never silently switches on automation that pushes to other repositories.

You do not need them to use department editions. Without them you run the same two scripts by
hand — `kb-build.mjs` after changing the master, `kb-collect.mjs` to pull a team's work back.
The workflows only remove that manual step.

| File | Lives in | Runs on | Does |
|---|---|---|---|
| `kb-build.yml` | the **master** base repo | push to `main` | rebuilds every department edition and pushes it |
| `kb-collect.yml` | each **edition** repo | push to `main` | imports the team's writing into the master |

## The token

Both workflows write to a **different repository** than the one they run in. The built-in
`GITHUB_TOKEN` cannot do that — it is scoped to its own repo — so you supply one yourself, as
the secret `KB_BOT_TOKEN` in every repo that runs a workflow.

**Recommended: a fine-grained personal access token.** github.com → Settings → Developer
settings → Personal access tokens → Fine-grained tokens → Generate new token. Grant it access to
**only** the master repo and the edition repos, and exactly one permission: **Repository
permissions → Contents → Read and write**. Set an expiry you will actually notice (90 days is a
sane default) and diarise the rotation. Then add it in each repo under Settings → Secrets and
variables → Actions → New repository secret, named `KB_BOT_TOKEN`.

**Optional: a separate machine account.** A token from your own account works and is the simplest
start; the cost is that automated pushes are attributable to you. A dedicated machine account
(GitHub permits these alongside a personal account) keeps the audit trail clean and lets you
revoke the automation without touching your own access. Add it as a collaborator on the master
and every edition repo, and mint the token from that account instead.

For an organisation a **GitHub App** is the better long-term answer — short-lived tokens, no
personal credential, per-repo installation — at the cost of more setup than a PAT.

Never paste a token into a file in the base. It belongs in repo secrets and nowhere else; the
ingest guard and `kb-collect` both scan for token shapes precisely because that mistake is easy.

## Before you enable them

1. **The loop breaker.** Both workflows skip commits whose git **author name** is `kb-bot`, which
   is what the other workflow sets. Without it, master → edition → master cycles forever. Do not
   switch those conditions to `author.username`: that field is GitHub's account lookup from the
   commit email and is **empty** when no such account exists, which disables the guard silently.
2. **Never force-push an edition.** An edition repo also holds the team's own commits.
3. **Run both by hand first** (`--dry`, then for real) until the counts look right. Automation
   that publishes to the wrong repo is expensive to take back.
4. **A red `kb-collect` run is the gate working.** Read the violations; never work around a
   rejection by copying files across by hand.
