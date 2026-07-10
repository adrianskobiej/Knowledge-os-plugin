# Myriad Self OS

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

## What Myriad Self OS does

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

- `template/` — knowledge-base scaffold (`AGENTS.md`, `scripts/reindex.mjs`, `viewer.html`, whitelist `.gitignore`, empty content dirs, `_templates/`, `wiki/` for decisions + per-person logs).
- `commands/` — slash-command sources (one source of truth `install.mjs` adapts per tool).
- `install.mjs` — cross-platform installer (command adapters + global awareness).
- `.claude-plugin/` + `hooks/` — Claude Code plugin + PostToolUse auto-reindex.

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
