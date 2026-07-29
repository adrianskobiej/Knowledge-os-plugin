# knowledge-os

**A portable company knowledge base that lives in Markdown and works with any AI coding agent.**

> **Created by Adrian Skobiej (Myriad Self).** Free to use, modify and deploy in your organization
> under the [MIT license](LICENSE) — just keep the copyright/attribution notice when you reuse or
> modify it.

Plain `.md` files are the source of truth. A zero-dependency script compiles them into a lightweight index for LLMs and a standalone, offline HTML viewer for humans. Works with Claude Code, Codex, Antigravity — or no agent at all.

**OKF-compatible.** Bundles conform to the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) (markdown + frontmatter with a `type` on every concept), so your knowledge interoperates with the wider OKF ecosystem — while keeping the richer retrieval (hierarchical paginated index, facets, search-by-meaning) layered on top.

---

## The problem

Company knowledge ends up scattered across wikis, Google Docs, Slack threads and people's heads. Two audiences are usually at odds:

- **Humans** want something nice to read and search.
- **LLMs/agents** choke when you dump a whole wiki into their context — it's slow, expensive, and they miss the relevant bits.

Most tools optimize for one and bolt the other on. And whatever you pick is usually locked to a single editor or AI assistant.

## What knowledge-os does

- **Markdown as the single source of truth.** Every article is a `.md` file with a small frontmatter block. Diff-able, portable, git-friendly, no lock-in.
- **Two compiled views from the same source:**
  - `INDEX.md` — a lightweight index (one line per article) the LLM reads **first**, so it loads only the 1–5 articles that actually matter instead of the whole base.
  - `viewer.html` — a standalone, offline, zero-build HTML reader for people (search, backlinks, dark mode). Double-click to open.
- **Tool-agnostic by design.** The engine is pure Node + a single HTML file. Each base ships an `AGENTS.md` that any agent reads to understand the workflow — so it works the same in Claude Code, Codex, Antigravity, Cursor, or by hand.
- **Wiki-style linking.** `[[slug]]` links build automatic backlinks.
- **"Data room" layer** for contested/changing knowledge: source provenance & authority, per-folder steering briefs, on-demand conflict/gap reports, and code-enforced protected quotes.

## How it works

```
write    → add a .md article (or drop raw notes in raw/ and let the agent compile them)
reindex  → node scripts/reindex.mjs        rebuilds INDEX.md + kb-data.js
read     → open viewer.html (human)  ·  read INDEX.md (LLM)
ask      → ./kb chat                       viewer + a live agent, on localhost (optional)
deploy   → commit + push to your company repo
```

Each company = its own private git repo. This repo is the machinery you stamp new bases out of.

> **The base stores knowledge, not projects.** Your code and projects stay wherever they already live (scattered across disk). You never move them into the base — from any project, you only save *distilled* knowledge (decisions, processes, facts, people) into the central base. The agent's global awareness makes this happen without leaving your project folder.

## Quick start

**Requirements:** [Node.js](https://nodejs.org) (that's it — no npm install, zero dependencies).

```bash
git clone https://github.com/<you>/knowledge-os-plugin.git ~/knowledge-os
cd ~/knowledge-os

# create a new knowledge base from the template
cp -R template ~/knowledge/mycompany
cd ~/knowledge/mycompany
git init
node scripts/reindex.mjs            # build INDEX.md + kb-data.js
open viewer.html                    # browse it (macOS; use your OS's open command otherwise)
```

### Chat with the base (optional)

The viewer is a file: you open it, you read, you close it. `./kb chat` adds the other half — it
serves the same viewer from `127.0.0.1` with a **💬 Chat** view, and puts a real Claude Code session
behind it, running inside the base. Every skill, assistant and connector that answers in your
terminal answers here too.

```bash
./kb chat            # reindex, start the runtime, open the viewer at the URL it prints
```

One resumable session per channel, transcripts kept in `.kb-chat/`. Channels come from three places:

| Channel | Where it comes from | Agents run in |
|---|---|---|
| **Base** | always there | the base |
| one per assistant | each card in `assistants/` | the base |
| one per project | a `projects/` article with `folder: ~/code/thing` | that folder, base attached |
| yours | `+ New channel` in the viewer | any folder you point it at |

In a project channel the agent works on the real files *and* keeps the base as a second working
directory — same assistant, same context, wherever it is standing. Type `@` in any room to summon
someone from the roster; the message goes out as written and the base's mention layer routes it.

Without the runtime the viewer stays exactly what it was — offline and read-only.

Because the runtime executes an agent on your machine, it is deliberately narrow: loopback only, a
fresh token per start (carried in the URL, and injected into the viewer's `kb-data.js` request so
the file with every article in it is not readable by a page that merely guessed the port), and
refusals for cross-site requests and non-loopback `Host` headers. The default permission mode is
`acceptEdits` — writes to the base go through, shell commands do not, and `git push` / `rm` are
denied. Tune it under `chat` in `knowledge.config.json`:

```json
"chat": { "port": 4319, "permissionMode": "acceptEdits", "billing": "subscription",
          "disallowedTools": ["Bash(git push:*)"] }
```

`acceptEdits` lets an agent write files but stops every shell command, which on its own is too tight
for a base whose own workflow *is* shell. So the default also allows the shell that cannot destroy
anything — reading, searching, git's read-only verbs, `node scripts/*` — while `git push` and `rm`
stay denied. Replace the whole set with `allowedTools` if you want a different line.

`"permissionMode": "bypassPermissions"` removes every gate. It works, and it is the setting to
think twice about — anything you type into that window can then run unattended.

**Billing.** Turns run on the Claude account you are signed into. `claude` bills to a metered API
key whenever one is in its environment, so a stray `export ANTHROPIC_API_KEY` would quietly move
every chat turn onto pay-per-token; the runtime withholds those variables from the turns it starts.
Set `"billing": "api"` to opt into metered billing on purpose. Who pays is shown under the channel
list, next to the permission mode.

**History** lives in two places, both on your machine: `.kb-chat/threads.json` (what the viewer
shows) and Claude Code's own session store under `~/.claude/projects/<folder>/<session>.jsonl` —
the same store the terminal uses, so `claude --resume <session-id>` picks a chat thread up where
you left it, and a terminal session can be continued in the viewer.

### Use it from your AI agent

Either way works:

1. **No install** — open the base folder in any agent. It reads `AGENTS.md` and runs the workflow.
2. **With `/kb-*` commands** — run the installer once; it detects your tools and installs adapters:

```bash
node install.mjs                 # detect tools, install adapters + register bases
node install.mjs --base=~/knowledge/mycompany   # also register a specific base
node install.mjs --dry-run       # preview, writes nothing
node install.mjs --tools=codex   # only specific tools (claude,codex,antigravity)
```

| Tool | Commands land in | Auto-reindex |
|---|---|---|
| Claude Code | `~/.claude/commands/` (or install as a plugin) | PostToolUse hook |
| Codex CLI | `~/.codex/prompts/` | git hook |
| Antigravity | `~/.gemini/skills/knowledge-os/` | git hook |
| any other / none | — (use `AGENTS.md`) | git hook |

**Discoverability across every project.** The installer also makes your agent *aware the base exists* — no matter which project you're working in. It writes a registry (`~/.config/knowledge-os/bases.json`) and a small managed block into each tool's **global** instruction file (Claude `~/.claude/CLAUDE.md`, Codex `~/.codex/AGENTS.md`, Antigravity `~/.gemini/AGENTS.md`). From then on, in any repo, the agent knows where your base is, reads it to answer questions, and offers to save durable knowledge into it — using the `/kb-*` skills. Bases under `~/knowledge/*` are auto-detected; add others with `--base=<path>`. Opt out with `--no-awareness`.

Tool-agnostic auto-reindex (replaces the Claude-only hook): in a base, run once
`node scripts/reindex.mjs --install-git-hook` — reindex then fires on commit / pull / checkout.

## Repository layout

- `template/` — knowledge-base scaffold (`AGENTS.md`, `scripts/` engine, `viewer.html`, whitelist `.gitignore`, empty content dirs, `_templates/`, `wiki/` for decisions + per-person logs, `_ci/` automation templates).
- `commands/` — slash-command sources (one source of truth `install.mjs` adapts per tool).
- `install.mjs` — cross-platform installer (command adapters + global awareness).
- `.claude-plugin/` + `hooks/` — Claude Code plugin + PostToolUse auto-reindex.

## Access: one master, one edition per department

Git access is per-**repository** — there is no folder-level secrecy inside a shared base, and
anyone who can clone one reads all of it. So a partial copy is published rather than pretended:

```bash
node scripts/kb-build.mjs --dept sales --out ../kb-sales
```

The edition carries articles marked `visibility: company` plus that one department's own, and
nothing else. It is its own repo, so the team physically cannot hold what it was not given, while
the master stays one tree and the `[[link]]` graph is never split. `kb-collect.mjs` carries the
team's own writing back, behind three fail-closed gates (path ownership, no self-promotion,
secret scan). Anything unclassified defaults to owners-only — a forgotten field must never widen
reach. The subject of access control is a **person**: an agent reads whatever clone sits on the
machine it was started on, so there is no separate agent permission to configure.

## Security

- The Markdown→HTML renderer escapes `& < > " '` and allows only `http`/`https`/`mailto`/anchor/relative URLs in links (`javascript:`/`data:` are dropped to `#`), so compiling untrusted material can't inject script into `viewer.html`.
- `kb-data.js` escapes `</script>` so content can't break out of the data block.
- Auto-reindex runs `scripts/reindex.mjs` from the nearest ancestor that has a `knowledge.config.json` — only edit files inside bases you trust.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full history, and the [Releases](../../releases) page for the latest tagged version.

## Releasing / contributing

Maintainers: follow [RELEASING.md](RELEASING.md) when shipping a change — it keeps the code, version, git tags, GitHub Releases and descriptions in sync (bumping the version alone is **not** a release).

## License

[MIT](LICENSE) © Adrian Skobiej
