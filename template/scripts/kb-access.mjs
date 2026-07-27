#!/usr/bin/env node
// kb-access.mjs — who may read what. Shared by kb-build.mjs, kb-collect.mjs and /kb-setup.
//
// Two questions, one module:
//   1. WHO AM I on this machine?  git user.email → roster → people/<slug>.md
//   2. WHO MAY READ this article? frontmatter `visibility:` → config defaults → fail-closed
//
// The subject of access control is a PERSON, never an agent. An agent reads whatever clone
// sits on the machine it was started on, so its reach is already its human's reach — there
// is nothing separate to filter.
//
// Enforcement is the REPOSITORY, not this file. Git access is per-repo; anyone who can clone
// a base reads all of it. These functions decide what gets BUILT INTO a derived edition —
// i.e. what lands on someone's disk in the first place.
//
// Import:  import { whoAmI, classify, mayRead } from './kb-access.mjs'
// CLI:     node scripts/kb-access.mjs            (report identity + reach on this machine)

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// `private` is the assistants/ vocabulary (only the card's author). For articles the
// equivalent reach is "owners" — accepted as an alias so one base can use one word.
export const VISIBILITIES = ['owners', 'company', 'department'];

export function normalizeVisibility(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'private' || s === 'owner') return 'owners';
  return VISIBILITIES.includes(s) ? s : '';
}

// `department:` accepts one slug or a [list] — a person or an article can sit in several.
export const asList = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s).trim()).filter(Boolean);

// Minimal frontmatter reader — same shape as reindex.mjs, kept local so this module
// stays importable without running the indexer.
export function frontmatter(raw) {
  if (!raw.startsWith('---')) return {};
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return {};
  const meta = {};
  for (const line of raw.slice(3, end).split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    meta[m[1]] = v.startsWith('[') && v.endsWith(']')
      ? v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : v.replace(/^["']|["']$/g, '');
  }
  return meta;
}

export function readConfig(root) {
  try { return JSON.parse(readFileSync(join(root, 'knowledge.config.json'), 'utf8')); }
  catch { return {}; }
}

// ── 1. Who am I? ─────────────────────────────────────────────────────────────
// git email → roster → people/<slug>.md. The roster slug is an AUTHOR slug (log/author
// convention) which may differ from the person slug, so fall back to matching by frontmatter.
export function whoAmI(root, config = readConfig(root)) {
  let email = '';
  try { email = execFileSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { /* no git — treat as an unknown reader, which is the safest default */ }
  const slug = (config.roster || {})[email] || '';
  const profile = findProfile(root, slug);
  return {
    email,
    slug,
    isOwner: String(profile.owner) === 'true' || ['owner', 'partner'].includes(String(profile.role || '').toLowerCase()),
    departments: asList(profile.department),
  };
}

function findProfile(root, slug) {
  const dir = join(root, 'people');
  if (!slug || !existsSync(dir)) return {};
  const direct = join(dir, slug + '.md');
  if (existsSync(direct)) return frontmatter(readFileSync(direct, 'utf8'));
  let byAuthor = null;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f === 'BRIEF.md' || f.startsWith('INDEX')) continue;
    const p = frontmatter(readFileSync(join(dir, f), 'utf8'));
    if (p.type === 'Persona') continue;
    if (p.slug === slug) return p;
    if (p.author === slug && (String(p.owner) === 'true' || !byAuthor)) byAuthor = p;
  }
  return byAuthor || {};
}

// ── 2. Who may read this article? ────────────────────────────────────────────
// Precedence, most specific first:
//   frontmatter `visibility:`  →  exact path  →  *suffix  →  longest prefix/  →  access.default
// Anything still unresolved is `owners`. FAIL-CLOSED is the point: a forgotten field must
// never widen reach. One missing `visibility:` on a payroll note would otherwise ship it.
export function defaultVisibility(relPath, access = {}) {
  const paths = access.paths || {};
  const p = String(relPath).split('\\').join('/');
  if (paths[p]) return { visibility: normalizeVisibility(paths[p]), rule: p };
  let suffix = null, prefix = null;
  for (const [key, val] of Object.entries(paths)) {
    if (key.startsWith('*')) {
      const s = key.slice(1);
      if (p.endsWith(s) && (!suffix || s.length > suffix.key.length)) suffix = { key: s, val };
    } else if (key.endsWith('/') && p.startsWith(key)) {
      if (!prefix || key.length > prefix.key.length) prefix = { key, val };
    }
  }
  const hit = suffix || prefix;
  if (hit) return { visibility: normalizeVisibility(hit.val), rule: hit.key };
  return { visibility: normalizeVisibility(access.default) || 'owners', rule: 'default' };
}

export function classify(relPath, meta = {}, access = {}) {
  const explicit = normalizeVisibility(meta.visibility);
  if (explicit) return { visibility: explicit, departments: asList(meta.department), source: 'frontmatter' };
  const d = defaultVisibility(relPath, access);
  return { visibility: d.visibility, departments: asList(meta.department), source: d.rule };
}

// A reader's reach. Owners and partners see everything, by design — the split exists so
// the base can hold personal context next to company context, not to fence off the owner.
export function mayRead(cls, who) {
  if (who.isOwner) return true;
  if (cls.visibility === 'company') return true;
  if (cls.visibility === 'department')
    return cls.departments.some(d => who.departments.includes(d));
  return false;
}

// Reach of a whole department edition (what kb-build puts in `kb-<dept>`).
export const readableByDepartment = (cls, dept) =>
  cls.visibility === 'company' || (cls.visibility === 'department' && cls.departments.includes(dept));

// ── Paths a department edition OWNS (they flow upward, master never overwrites them) ──
// `<dept>` is substituted with the department slug. Anything not listed is master-owned.
export const DEFAULT_WRITABLE = ['departments/<dept>/', 'tasks/<dept>/', 'journal/', 'wiki/log/'];

export function writablePaths(dept, access = {}) {
  return (access.writable || DEFAULT_WRITABLE).map(p => p.split('<dept>').join(dept));
}

export const isWritable = (relPath, dept, access = {}) => {
  const p = String(relPath).split('\\').join('/');
  return writablePaths(dept, access).some(w => (w.endsWith('/') ? p.startsWith(w) : p === w));
};

// `journal/<person>/…` and `wiki/log/log-<person>.md` are per-person paths inside a
// department-writable zone. Returns the person slug the path belongs to, or '' if none.
export function personOfPath(relPath) {
  const p = String(relPath).split('\\').join('/');
  let m = p.match(/^journal\/([^/]+)\//);
  if (m) return m[1];
  m = p.match(/^wiki\/log\/log-([^/]+)\.md$/);
  if (m) return m[1];
  return '';
}

// CLI — a straight answer to "what does this machine reach?".
if (process.argv[1] && process.argv[1].endsWith('kb-access.mjs')) {
  const root = process.cwd();
  const config = readConfig(root);
  const who = whoAmI(root, config);
  console.log(`identity : ${who.slug || '(unknown — email not in roster)'}${who.email ? ` <${who.email}>` : ''}`);
  console.log(`role     : ${who.isOwner ? 'owner/partner — reads everything' : 'employee'}`);
  console.log(`dept     : ${who.departments.join(', ') || '(none)'}`);
  const access = config.access || {};
  console.log(`default  : ${normalizeVisibility(access.default) || 'owners'} (fail-closed)`);
  console.log(`writable : ${who.departments.map(d => writablePaths(d, access).join(', ')).join(' | ') || '(read-only)'}`);
}
