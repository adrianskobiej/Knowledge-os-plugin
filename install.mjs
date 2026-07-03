#!/usr/bin/env node
// install.mjs — installs knowledge-os command adapters into every AI coding tool found.
// One source (commands/*.md), adapted to each tool's convention. Pure Node, zero deps,
// cross-platform (macOS / Linux / Windows).
//
// Usage:
//   node install.mjs                     auto-detect tools, install adapters + register bases
//   node install.mjs --tools=codex,claude   only these tools (comma list)
//   node install.mjs --base=~/knowledge/x   register a specific base for global awareness
//   node install.mjs --no-awareness      install commands only, skip global awareness
//   node install.mjs --list              detect bases already on this machine (JSON), write nothing
//   node install.mjs --dry-run           print what would happen, write nothing
//
// Engine + viewer + AGENTS.md are already tool-agnostic — this only installs the
// convenience "slash command" layer where each tool expects it.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HERE = new URL('.', import.meta.url).pathname;
const HOME = homedir();
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const DRY = process.argv.includes('--dry-run');
const FORCED = arg('tools', '').split(',').map(s => s.trim()).filter(Boolean);
const BASES_ARG = arg('base', '').split(',').map(s => s.trim()).filter(Boolean);
const NO_AWARENESS = process.argv.includes('--no-awareness');

// ── Tool registry ────────────────────────────────────────────────────────────
// detect: is the tool present on this machine? dir: where its commands/skills live.
const TOOLS = {
  claude: {
    label: 'Claude Code',
    detect: () => existsSync(join(HOME, '.claude')),
    dest: join(HOME, '.claude', 'commands', 'knowledge-os'),
    invoke: '/knowledge-os:kb-query (and kb-init, kb-ingest, …)',
  },
  codex: {
    label: 'Codex CLI',
    detect: () => existsSync(join(HOME, '.codex')),
    dest: join(HOME, '.codex', 'prompts'),
    invoke: '/prompts:kb-query (and kb-init, kb-ingest, …)',
  },
  antigravity: {
    label: 'Antigravity',
    detect: () => existsSync(join(HOME, '.gemini')) || existsSync(join(HOME, '.antigravity')),
    dest: join(HOME, '.gemini', 'skills', 'knowledge-os'),
    invoke: 'loaded as a skill — ask in natural language or use /kb-* workflows',
  },
};

// ── Read command sources (one source of truth) ───────────────────────────────
function parse(raw) {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };
  const meta = {};
  for (const line of raw.slice(3, end).trim().split('\n')) {
    const m = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: raw.slice(end + 4).replace(/^\s*\n/, '') };
}

function loadCommands(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.startsWith('kb-') && f.endsWith('.md'))
    .map(f => ({ name: f.replace(/\.md$/, ''), ...parse(readFileSync(join(dir, f), 'utf8')) }));
}

const CMDS = loadCommands(join(HERE, 'commands'));

// ── Emitters per tool ────────────────────────────────────────────────────────
const write = (p, content) => {
  if (DRY) { console.log(`   would write ${p}`); return; }
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
  console.log(`   ✓ ${p}`);
};

function fm(obj) {
  const lines = Object.entries(obj).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function installClaude(dest) {
  // Claude reads frontmatter incl. allowed-tools — copy as-is into a namespaced folder.
  for (const c of CMDS) write(join(dest, `${c.name}.md`), fm(c.meta) + c.body);
}

function installCodex(dest) {
  // Codex prompts: description + argument-hint frontmatter, $ARGUMENTS supported.
  for (const c of CMDS) {
    const meta = {}; if (c.meta.description) meta.description = c.meta.description;
    if (c.meta['argument-hint']) meta['argument-hint'] = c.meta['argument-hint'];
    write(join(dest, `${c.name}.md`), fm(meta) + c.body);
  }
}

function installAntigravity(dest) {
  // Antigravity: one on-demand skill bundling the whole workflow + command procedures.
  let skill = fm({
    name: 'knowledge-os',
    description: 'Company knowledge base (knowledge-os): query, ingest, lint, sync and deploy a Markdown knowledge base. Use when working inside a folder that has knowledge.config.json / INDEX.md / scripts/reindex.mjs.',
  });
  skill += `# knowledge-os\n\nA portable company knowledge base. Source of truth = \`.md\` files; \`scripts/reindex.mjs\` builds \`INDEX.md\` (for the LLM) and \`kb-data.js\` (for \`viewer.html\`). Read \`AGENTS.md\` in the base first.\n\nEngine (run in the base dir):\n\n\`\`\`\nnode scripts/reindex.mjs            # rebuild INDEX.md + kb-data.js\nnode scripts/reindex.mjs --lint     # health-check only\n\`\`\`\n\n## Procedures\n`;
  for (const c of CMDS) {
    skill += `\n### ${c.name}\n${c.meta.description ? `_${c.meta.description}_\n` : ''}\n${c.body}\n`;
  }
  write(join(dest, 'SKILL.md'), skill);
}

const EMIT = { claude: installClaude, codex: installCodex, antigravity: installAntigravity };

// ── Global awareness ─────────────────────────────────────────────────────────
// Adapters give each tool the /kb-* commands (the "how"). Awareness tells every
// agent, in any project, that a base EXISTS and where (the "where") — by writing a
// managed block into each tool's GLOBAL instruction file + a registry it can read.
const REG_DIR = join(HOME, '.config', 'knowledge-os');
const REG_FILE = join(REG_DIR, 'bases.json');
const GLOBAL_INSTR = {
  claude: join(HOME, '.claude', 'CLAUDE.md'),
  codex: join(HOME, '.codex', 'AGENTS.md'),
  antigravity: join(HOME, '.gemini', 'AGENTS.md'),
};
const MARK_BEGIN = '<!-- knowledge-os:begin (managed by install.mjs — do not edit inside) -->';
const MARK_END = '<!-- knowledge-os:end -->';

function discoverBases() {
  if (BASES_ARG.length) return BASES_ARG.map(p => (p.startsWith('~') ? join(HOME, p.slice(1)) : p));
  const root = join(HOME, 'knowledge');                 // convention: ~/knowledge/<slug>
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map(d => join(root, d))
    .filter(p => existsSync(join(p, 'knowledge.config.json')));
}
const loadRegistry = () => { try { return JSON.parse(readFileSync(REG_FILE, 'utf8')).bases || []; } catch { return []; } };

function awarenessText(bases) {
  const list = bases.map(b => `- \`${b}\``).join('\n');
  return `${MARK_BEGIN}
## Knowledge base (knowledge-os)

A personal/company knowledge base is available on this machine. Registered base(s):
${list}

The base stores ONLY distilled knowledge (decisions, processes, facts, people) as Markdown — it is NOT a project store. Never move, copy, or commit project source code or whole files into it; keep working in each project's own location and only save knowledge here.

When the user asks about something that may be stored there, consult it: read \`<base>/INDEX.md\` first, then open only the relevant \`.md\` files (follow \`[[slug]]\` links) — never load the whole base. When the user shares durable, reusable knowledge worth keeping, distill it into a short \`.md\` article in the base and run \`node scripts/reindex.mjs\` there afterwards. Full rules live in \`<base>/AGENTS.md\`.
${MARK_END}`;
}

function injectAwareness(file, text) {
  let cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`${MARK_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARK_END}`);
  cur = re.test(cur) ? cur.replace(re, text) : (cur.trimEnd() + (cur ? '\n\n' : '') + text + '\n');
  if (DRY) { console.log(`   would update ${file}`); return; }
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, cur);
  console.log(`   ✓ ${file}`);
}

// ── Detect mode (--list) ──────────────────────────────────────────────────────
// Onboarding step 0: find any base ALREADY known on this machine — across tools —
// before asking the user anything or creating a new base. Sources (all cross-tool):
//   1) the shared registry ~/.config/knowledge-os/bases.json (written by every tool)
//   2) the ~/knowledge/<slug>/ convention (dirs with knowledge.config.json)
// Prints JSON so the agent can branch reliably. Writes nothing.
if (process.argv.includes('--list')) {
  // Plugin version — so agents can flag bases whose engine copy is behind (see /kb-upgrade).
  let pluginVersion = '';
  try { pluginVersion = JSON.parse(readFileSync(join(HERE, '.claude-plugin', 'plugin.json'), 'utf8')).version || ''; } catch {}
  const semverLt = (a, b) => { // true if a < b (loose semver: missing parts = 0)
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
    }
    return false;
  };
  const registry = loadRegistry();
  const discovered = discoverBases();
  const seen = new Set();
  const bases = [...registry, ...discovered].filter(p => (seen.has(p) ? false : seen.add(p)))
    .map(p => {
      let name = '', slug = '', version = '';
      try { const c = JSON.parse(readFileSync(join(p, 'knowledge.config.json'), 'utf8')); name = c.company?.name || ''; slug = c.company?.slug || ''; version = c.version || ''; } catch {}
      return {
        path: p, name, slug, version,
        exists: existsSync(join(p, 'knowledge.config.json')),
        outdated: Boolean(pluginVersion && version && semverLt(version, pluginVersion)),
      };
    });
  const toolsDetected = Object.keys(TOOLS).filter(t => TOOLS[t].detect());
  const adapters = Object.fromEntries(Object.keys(TOOLS).map(t => [t, existsSync(TOOLS[t].dest)]));
  console.log(JSON.stringify({ found: bases.length > 0, pluginVersion, bases, toolsDetected, adaptersInstalled: adapters, registryFile: REG_FILE }, null, 2));
  process.exit(0);
}

// ── Run ──────────────────────────────────────────────────────────────────────
console.log(`\nknowledge-os installer${DRY ? ' (dry run)' : ''}\n`);
const chosen = FORCED.length ? FORCED : Object.keys(TOOLS).filter(t => TOOLS[t].detect());
if (!chosen.length) {
  console.log('No supported tool detected (Claude Code / Codex / Antigravity).');
  console.log('Force one anyway, e.g.:  node install.mjs --tools=codex\n');
  process.exit(0);
}

const summary = [];
for (const t of chosen) {
  const tool = TOOLS[t];
  if (!tool) { console.log(`? Unknown tool "${t}" — skipping`); continue; }
  const present = tool.detect();
  console.log(`▸ ${tool.label}${present ? '' : ' (not detected — installing anyway, forced)'}`);
  EMIT[t](tool.dest);
  summary.push(`  ${tool.label}: ${tool.invoke}`);
  console.log('');
}

if (!NO_AWARENESS) {
  const bases = [...new Set([...loadRegistry(), ...discoverBases()])];
  if (bases.length) {
    console.log('▸ Global awareness (so every project knows the base exists)');
    if (DRY) console.log(`   would update ${REG_FILE}`);
    else { mkdirSync(REG_DIR, { recursive: true }); writeFileSync(REG_FILE, JSON.stringify({ bases }, null, 2)); console.log(`   ✓ ${REG_FILE}`); }
    const text = awarenessText(bases);
    for (const t of chosen) if (GLOBAL_INSTR[t]) injectAwareness(GLOBAL_INSTR[t], text);
    console.log('');
  } else {
    console.log('▸ Global awareness: no base found yet.');
    console.log('   Create one, then re-run, e.g.:  node install.mjs --base=~/knowledge/mycompany\n');
  }
}

console.log('Done. How to use:');
console.log(summary.join('\n'));
console.log('\nAny tool also works with no install: open a base folder and let the assistant read AGENTS.md.\n');
