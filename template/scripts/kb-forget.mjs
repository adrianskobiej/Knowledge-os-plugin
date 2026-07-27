#!/usr/bin/env node
// kb-forget.mjs — retract an article and repair everything that pointed at it.
//
// Usage:  node scripts/kb-forget.mjs <slug>                        (preview — writes nothing)
//         node scripts/kb-forget.mjs <slug> --replaced-by <slug>   (redirect references)
//         node scripts/kb-forget.mjs <slug> --apply
//
// Why this exists: deleting a file is the easy half. The base is a link graph, so a plain
// `rm` leaves every `[[reference]]` dangling — reindex reports each one as `⚠ Dead link`,
// nobody fixes them, and after a while the whole lint is noise people scroll past. Knowledge
// bases rot from retractions nobody finished, not from articles nobody wrote.
//
// Two ways to retract:
//   • with `--replaced-by` — references are REDIRECTED to the replacement, and the
//     replacement records `supersedes:` so the trail survives the deletion.
//   • without it — references are defused to plain text marked `(retracted)`, which reads
//     honestly and keeps the sentence intact.
//
// DRY RUN BY DEFAULT. Removing knowledge is not something to discover after the fact.
// Git keeps the file's history; this only removes it from the working base.

import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { join, relative, sep, extname, basename } from 'node:path';

const ROOT = process.cwd();
const [, , target, ...rest] = process.argv;
const APPLY = rest.includes('--apply');
const REPLACED_BY = (() => { const i = rest.indexOf('--replaced-by'); return i > -1 ? rest[i + 1] : ''; })();
const CONTENT_DIRS = ['departments', 'projects', 'people', 'concepts', 'skills', 'meetings', 'tasks',
                      'journal', 'clients', 'products', 'procedures', 'assistants', 'research'];
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const RELATION_FIELDS = ['supersedes', 'superseded_by', 'depends_on'];

if (!target) {
  console.error('Usage: kb-forget.mjs <slug> [--replaced-by <slug>] [--apply]');
  process.exit(2);
}

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (extname(e.name) === '.md' && !/^INDEX(\.p\d+)?\.md$/.test(e.name)) acc.push(full);
  }
  return acc;
}
const files = CONTENT_DIRS.flatMap(d => walk(join(ROOT, d)));
const slugOf = f => {
  const m = readFileSync(f, 'utf8').match(/^---[\s\S]*?^slug:\s*(.+?)\s*$/m);
  return (m ? m[1] : basename(f, '.md')).replace(/^["']|["']$/g, '');
};

const victim = files.find(f => slugOf(f) === target);
if (!victim) { console.error(`✗ No article with slug "${target}".`); process.exit(2); }
if (REPLACED_BY && !files.some(f => slugOf(f) === REPLACED_BY)) {
  console.error(`✗ Replacement "${REPLACED_BY}" does not exist — refusing to point references at nothing.`);
  process.exit(2);
}
if (REPLACED_BY === target) { console.error('✗ An article cannot replace itself.'); process.exit(2); }

// ── Who points here ─────────────────────────────────────────────────────────
const edits = [];
for (const f of files) {
  if (f === victim) continue;
  const raw = readFileSync(f, 'utf8');
  let out = raw, links = 0, rels = 0;

  // Body references. Code fences are left alone — a slug inside an example is not a reference.
  out = out.split(/(```[\s\S]*?```)/g).map(seg => {
    if (seg.startsWith('```')) return seg;
    return seg.replace(WIKILINK, (whole, slug, label) => {
      if (slug.trim() !== target) return whole;
      links++;
      const text = (label || slug).trim();
      return REPLACED_BY ? `[[${REPLACED_BY}|${text}]]` : `${text} (retracted)`;
    });
  }).join('');

  // Frontmatter relations. A stale `depends_on` is worse than a stale mention: tools act on it.
  const end = out.indexOf('\n---', 3);
  if (out.startsWith('---') && end !== -1) {
    const head = out.slice(0, end).split('\n').map(line => {
      const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (!m || !RELATION_FIELDS.includes(m[1])) return line;
      const vals = (m[2].startsWith('[') ? m[2].replace(/^\[|\]$/g, '').split(',') : [m[2]])
        .map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (!vals.includes(target)) return line;
      rels++;
      const next = vals.map(v => (v === target ? REPLACED_BY : v)).filter(Boolean);
      return next.length ? `${m[1]}: [${[...new Set(next)].join(', ')}]` : null;   // drop the field entirely
    }).filter(l => l !== null).join('\n');
    out = head + out.slice(end);
  }

  if (out !== raw) edits.push({ file: f, out, links, rels });
}

// The replacement records what it replaces, so the trail outlives the deleted file.
let supersedesNote = null;
if (REPLACED_BY) {
  const rf = files.find(f => slugOf(f) === REPLACED_BY);
  const raw = readFileSync(rf, 'utf8');
  const end = raw.indexOf('\n---', 3);
  if (end !== -1) {
    const head = raw.slice(0, end);
    const m = head.match(/^supersedes:\s*(.*)$/m);
    const cur = m ? (m[1].startsWith('[') ? m[1].replace(/^\[|\]$/g, '').split(',') : [m[1]]).map(x => x.trim()).filter(Boolean) : [];
    if (!cur.includes(target)) {
      const line = `supersedes: [${[...cur, target].join(', ')}]`;
      supersedesNote = { file: rf, out: m ? raw.replace(/^supersedes:\s*.*$/m, line) : head + `\n${line}` + raw.slice(end) };
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const rel = f => relative(ROOT, f).split(sep).join('/');
console.log(`kb-forget${APPLY ? '' : ' (dry run)'} — retracting "${target}"  ·  ${rel(victim)}`);
console.log(REPLACED_BY ? `  references redirect to: ${REPLACED_BY}` : '  references become plain text marked (retracted)');
if (!edits.length && !supersedesNote) console.log('  nothing points here — a clean removal.');
for (const e of edits) {
  const what = [e.links && `${e.links} link(s)`, e.rels && `${e.rels} relation(s)`].filter(Boolean).join(', ');
  console.log(`  ✎ ${rel(e.file)} — ${what}`);
}
if (supersedesNote) console.log(`  ✎ ${rel(supersedesNote.file)} — records supersedes: ${target}`);

if (!APPLY) {
  console.log(`\nNothing was changed. Re-run with --apply to retract.`);
  process.exit(0);
}

for (const e of edits) writeFileSync(e.file, e.out);
if (supersedesNote) writeFileSync(supersedesNote.file, supersedesNote.out);
rmSync(victim, { force: true });

// One line in the author's own log — a retraction is a decision, and the base keeps those.
try {
  let author = '';
  const cfg = JSON.parse(readFileSync(join(ROOT, 'knowledge.config.json'), 'utf8'));
  const { execFileSync } = await import('node:child_process');
  const email = execFileSync('git', ['config', 'user.email'], { cwd: ROOT, encoding: 'utf8' }).trim();
  author = (cfg.roster || {})[email] || '';
  if (author && existsSync(join(ROOT, 'wiki', 'log')))
    appendFileSync(join(ROOT, 'wiki', 'log', `log-${author}.md`),
      `- retracted \`${target}\`${REPLACED_BY ? ` → replaced by \`${REPLACED_BY}\`` : ''} (${edits.length} file(s) repaired)\n`);
} catch { /* logging is a courtesy, not a precondition */ }

console.log(`\n✓ Retracted. ${edits.length} file(s) repaired, ${rel(victim)} removed.`);
console.log('  Run `node scripts/reindex.mjs` to rebuild the index and the graph.');
