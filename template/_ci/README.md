# _ci — automation templates for department editions

These are **templates, not active workflows**. Copy the one you want into `.github/workflows/`
in the right repo and fill in the placeholders. They are kept here, inert, so that installing
a base never silently switches on automation that pushes to other repositories.

| File | Lives in | Runs on | Does |
|---|---|---|---|
| `kb-build.yml` | the **master** base repo | push to `main` | rebuilds every department edition and pushes it |
| `kb-collect.yml` | each **edition** repo | push to `main` | imports the team's writing into the master |

## Before you enable them

1. **A machine account.** Create a dedicated GitHub user (the workflows below call it `kb-bot`)
   with write access to the master and to every edition repo. Store its token as the secret
   `KB_BOT_TOKEN` in each repo.
2. **The loop breaker.** Both workflows skip commits authored by `kb-bot`. Without that,
   master → edition → master cycles forever. Do not remove those conditions.
3. **Never force-push an edition.** An edition repo also holds the team's own commits.
4. **Run both by hand first** (`--dry`, then for real) until the counts look right. Automation
   that publishes to the wrong repo is expensive to take back.
