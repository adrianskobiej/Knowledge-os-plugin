#!/usr/bin/env node
// kb-collect.mjs — carry a department edition's own writing back UP into the master base.
//
// Usage:  node scripts/kb-collect.mjs --dept sales --from ../kb-sales
//         node scripts/kb-collect.mjs --dept sales --from ../kb-sales --dry
//         node scripts/kb-collect.mjs --dept sales --from ../kb-sales --allow-deletes
//
// Direction: UP (edition → master). The other trip is kb-build.mjs.
//
// Three gates, all FAIL-CLOSED. Any breach rejects the WHOLE batch rather than quietly
// importing the acceptable part — a team that silently loses half a push learns nothing,
// a team that gets a red error fixes it.
//
//   1. PATH      — every change must sit in a path this department owns.
//   2. PROMOTION — nobody publishes themselves company-wide; only the owner widens reach.
//   3. SECRETS   — the same high-signal key/token shapes the ingest guard rejects.
//
// Exit code 1 on rejection, so CI stops instead of merging.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep, dirname, extname } from 'node:path';
import { readConfig, frontmatter, normalizeVisibility, asList, classify, readableByDepartment, isWritable, writablePaths, personOfPath } from './kb-access.mjs';
import { scanSecrets } from './kb-guard.mjs';

const ROOT = process.cwd();
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
const DEPT = arg('--dept');
const FROM = arg('--from');
const DRY = process.argv.includes('--dry');
const ALLOW_DELETES = process.argv.includes('--allow-deletes');

const GENERATED = new Set(['INDEX.md', 'INDEX-facets.md', 'INSIGHTS.md', 'GAPS.md', 'LESSONS.md',
  'BOARD.md', 'ALIGNMENT.md', 'kb-data.js', 'graph.json', '.quotes.lock.json']);
// Zone indexes are generated too (`<zone>/INDEX.md`, paginated `INDEX.pN.md`). They must
// never ship: a stale index lists articles by title and summary, including ones this edition
// is not allowed to receive.
const GENERATED_INDEX = /^INDEX(\.p\d+)?\.md$/;
const SKIP_DIRS = new Set(['raw', 'memory', 'eval', '.git', 'node_modules', 'scripts', '_templates']);

if (!DEPT || !FROM) {
  console.error('Usage: kb-collect.mjs --dept <slug> --from <dir> [--dry] [--allow-deletes]');
  process.exit(2);
}
if (!existsSync(FROM)) { console.error(`✗ No such edition: ${FROM}`); process.exit(2); }

const config = readConfig(ROOT);
const access = config.access || {};

function walk(base, dir = base, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(base, full).split(sep).join('/');
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || GENERATED.has(rel) || GENERATED_INDEX.test(e.name)) continue;
    if (e.isDirectory()) walk(base, full, acc);
    else if (['.md', '.json'].includes(extname(e.name)) && rel !== 'knowledge.config.json' && rel !== 'viewer.html') acc.push(rel);
  }
  return acc;
}

// ── What actually changed ────────────────────────────────────────────────────
// Only paths the edition OWNS are candidates. Master-owned files are never imported, so
// an edit there cannot reach the master — it is simply lost on the next kb-build. That is
// worth saying out loud (below) but it is not grounds to reject the team's real work:
// kb-build rewrites out-of-edition [[links]], so master-owned files legitimately differ
// from the master on every single build. Rejecting on that would reject every push.
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
// Written by kb-build: the hash of every master-owned file AS SHIPPED. Comparing against
// this (not against the master) is what makes tamper detection honest — kb-build rewrites
// out-of-edition [[links]], so those files always differ from the master by design.
let builtManifest = null;
try { builtManifest = JSON.parse(readFileSync(join(FROM, '.kb-edition.json'), 'utf8')).files || null; } catch { /* older edition — skip the check */ }

const incoming = walk(FROM);
const changes = [], ignored = [];
for (const rel of incoming) {
  const src = readFileSync(join(FROM, rel), 'utf8');
  const dstPath = join(ROOT, rel);
  if (!isWritable(rel, DEPT, access)) {
    if (builtManifest && builtManifest[rel] && builtManifest[rel] !== sha(src)) ignored.push(rel);
    continue;
  }
  if (existsSync(dstPath) && readFileSync(dstPath, 'utf8') === src) continue;
  changes.push({ rel, kind: existsSync(dstPath) ? 'modified' : 'added', src });
}
// Deletions are reported but never applied without an explicit flag — one `rm` in an
// edition must not be able to erase knowledge from the master. Only files the edition
// actually received can count as deleted; owners-only files were never there to remove.
const incomingSet = new Set(incoming);
const deletions = walk(ROOT).filter(rel => {
  if (!isWritable(rel, DEPT, access) || incomingSet.has(rel)) return false;
  const meta = extname(rel) === '.md' ? frontmatter(readFileSync(join(ROOT, rel), 'utf8')) : {};
  return readableByDepartment(classify(rel, meta, access), DEPT);
});

const reportIgnored = () => {
  if (!ignored.length) return;
  console.error(`⚠ ${ignored.length} master-owned file(s) were edited in the edition and NOT imported.`);
  console.error(`  They will be overwritten on the next kb-build — move the content into: ${writablePaths(DEPT, access).join(', ')}`);
  for (const rel of ignored) console.error(`  · ${rel}`);
};

if (!changes.length && !deletions.length) {
  reportIgnored();
  console.log(`kb-collect — edition "${DEPT}": nothing to collect.`);
  process.exit(0);
}

// ── The three gates ──────────────────────────────────────────────────────────
const violations = [];

// Gate 1 — path ownership. Everything here already sits in a department-owned path;
// what is left to check is WHOSE it is inside that zone.
const people = new Map();
if (existsSync(join(ROOT, 'people')))
  for (const f of readdirSync(join(ROOT, 'people'))) {
    if (!f.endsWith('.md') || f === 'BRIEF.md' || f.startsWith('INDEX')) continue;
    const p = frontmatter(readFileSync(join(ROOT, 'people', f), 'utf8'));
    people.set(p.slug || f.replace(/\.md$/, ''), p);
  }

for (const c of changes) {
  // Per-person paths inside a department-writable zone must belong to someone in it.
  const person = personOfPath(c.rel);
  if (person) {
    const p = people.get(person);
    if (!p) violations.push(`PATH — ${c.rel} belongs to unknown person "${person}" (no people/${person}.md)`);
    else if (!asList(p.department).includes(DEPT))
      violations.push(`PATH — ${c.rel} belongs to "${person}", who is not in department "${DEPT}"`);
  }
}

// Gate 2 — no self-promotion.
for (const c of changes) {
  if (extname(c.rel) !== '.md') continue;
  const meta = frontmatter(c.src);
  const vis = normalizeVisibility(meta.visibility);
  if (vis === 'company' || vis === 'owners')
    violations.push(`PROMOTION — ${c.rel} arrives as "visibility: ${meta.visibility}"; an edition may only set "department". Widening reach is the owner's call.`);
  const depts = asList(meta.department);
  if (depts.length && !depts.every(d => d === DEPT))
    violations.push(`PROMOTION — ${c.rel} claims department [${depts.join(', ')}]; edition "${DEPT}" may only write its own.`);
}

// Gate 3 — secrets.
for (const c of changes) {
  for (const hit of scanSecrets(c.src))
    violations.push(`SECRET — ${c.rel}:${hit.line} looks like ${hit.label}`);
}

if (violations.length) {
  reportIgnored();
  console.error(`✗ kb-collect REJECTED the whole batch from "${DEPT}" — ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  · ${v}`);
  console.error(`\nNothing was written to the master. Fix the listed files and push again.`);
  process.exit(1);
}

// ── Apply ────────────────────────────────────────────────────────────────────
for (const c of changes) {
  if (DRY) continue;
  const p = join(ROOT, c.rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, c.src);
}
if (ALLOW_DELETES && !DRY) for (const rel of deletions) rmSync(join(ROOT, rel), { force: true });

reportIgnored();
console.log(`kb-collect${DRY ? ' (dry run)' : ''} — edition "${DEPT}" → master`);
console.log(`  added    : ${changes.filter(c => c.kind === 'added').length}`);
console.log(`  modified : ${changes.filter(c => c.kind === 'modified').length}`);
if (deletions.length)
  console.log(`  deleted  : ${deletions.length} ${ALLOW_DELETES ? '(applied)' : '(NOT applied — pass --allow-deletes)'}`);
console.log(`  gates    : path · promotion · secrets — all passed`);
