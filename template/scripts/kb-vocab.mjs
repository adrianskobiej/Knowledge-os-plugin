#!/usr/bin/env node
// kb-vocab.mjs — tag & entity hygiene. Finds the same idea written several ways.
//
// Usage:  node scripts/kb-vocab.mjs            (report)
//         node scripts/kb-vocab.mjs --json      (machine-readable)
//
// Why this exists: facets are only useful when one idea has one name. Left alone, a base
// drifts — `website`, `websites`, `www` become three separate facets and a search that
// asks for one misses the other two. The usual workaround is to make the model guess
// synonyms at query time; this fixes the cause instead.
//
// READ-ONLY by design. It proposes merges and never rewrites an article: choosing the
// canonical term is an editorial call, and a bulk rename of someone's tags is not
// something a script should do behind their back.
//
// `vocabulary.json` (optional, at the base root) declares the canonical terms:
//   { "tags": { "canonical": ["process", "metric"], "aliases": { "kpi": "metric" } },
//     "entityTypes": ["client", "product", "person"] }
// Without it the intrinsic checks below still run — you get value before curating anything.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const JSON_OUT = process.argv.includes('--json');
const CONTENT_DIRS = ['departments', 'projects', 'people', 'concepts', 'skills', 'meetings', 'tasks', 'journal'];

// ── Normalization ───────────────────────────────────────────────────────────
// Folds diacritics and separators so that "Lead-Gen", "lead gen" and "leadgen" collapse
// to one key. Two tags landing on the same key are the same word typed differently —
// that is a certainty, not a guess, so it is reported separately from fuzzy matches.
const FOLD = { á:'a', ä:'a', à:'a', â:'a', ã:'a', å:'a', ą:'a', ć:'c', č:'c', ç:'c', ď:'d', é:'e', ě:'e', ë:'e', è:'e', ê:'e', ę:'e', í:'i', ï:'i', ì:'i', î:'i', ł:'l', ń:'n', ñ:'n', ň:'n', ó:'o', ö:'o', ò:'o', ô:'o', õ:'o', ø:'o', ř:'r', ś:'s', š:'s', ş:'s', ť:'t', ú:'u', ü:'u', ù:'u', û:'u', ů:'u', ý:'y', ÿ:'y', ź:'z', ż:'z', ž:'z', ß:'ss' };
export const normalize = s => String(s).toLowerCase()
  .replace(/[^a-z0-9]/g, c => FOLD[c] ?? (/[a-z0-9]/.test(c) ? c : ''))
  .replace(/[^a-z0-9]/g, '');

// ── Distance ────────────────────────────────────────────────────────────────
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// English/Polish-ish plural or inflection of the same stem: "website"/"websites".
const isInflection = (a, b) => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return l.length - s.length <= 2 && l.startsWith(s);
};

// A numbered series is deliberate, not drift: etap-0…etap-9, q1/q2, v1/v2 are distinct
// values of one dimension. Strip the digits — if what remains is identical, leave them be.
const isNumberedSeries = (a, b) =>
  /\d/.test(a + b) && a.replace(/\d+/g, '') === b.replace(/\d+/g, '');

// One term ending with the whole of the other is a NARROWER COMPOUND, not a misspelling:
// `leads-method` ends with `ads-method`, `co-founder` ends with `founder`. An edit distance
// this small is a coincidence of prefixing, and merging them would destroy a real distinction.
// Inflection is the opposite shape — the extra characters go on the END (website → websites).
const isNarrowerCompound = (a, b) => {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return l !== s && l.endsWith(s) && !l.startsWith(s);
};

// `audyt` → `audyt-ai` adds a whole SEGMENT, which narrows the subject to a specific thing;
// `website` → `websites` adds letters to the same word, which is inflection. The hyphen is the
// only thing that separates the two cases and normalization strips it, so the RAW spellings
// decide. Without this, a general term looks like a misspelling of its own specialisation.
const addsSegment = (ra, rb) => {
  if (!ra || !rb) return false;
  const [s, l] = ra.length <= rb.length ? [ra, rb] : [rb, ra];
  const ss = String(s).split('-'), ls = String(l).split('-');
  return ls.length > ss.length && ss.every((seg, i) => seg === ls[i]);
};

// A pair is worth flagging when it is almost certainly one idea typed twice.
// Short tags are excluded: at 3 characters, an edit distance of 1 links unrelated words
// (`www`/`vsl`, `dev`/`des`), and a false merge suggestion is worse than a missed one.
// `rawA`/`rawB` are the original spellings; pass them when available, since some distinctions
// only survive in the unnormalized form.
export function areVariants(a, b, rawA, rawB) {
  if (a === b) return false;
  if (Math.min(a.length, b.length) < 4) return false;
  if (isNumberedSeries(a, b) || isNarrowerCompound(a, b) || addsSegment(rawA, rawB)) return false;
  if (isInflection(a, b)) return true;
  return levenshtein(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
}

// ── Collect ─────────────────────────────────────────────────────────────────
function frontmatter(raw) {
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
const asList = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s).trim()).filter(Boolean);

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (extname(e.name) === '.md' && !/^INDEX(\.p\d+)?\.md$/.test(e.name)) acc.push(full);
  }
  return acc;
}

export function collect(root = ROOT) {
  const tags = new Map(), entities = new Map();
  for (const dir of CONTENT_DIRS) {
    for (const f of walk(join(root, dir))) {
      const meta = frontmatter(readFileSync(f, 'utf8'));
      for (const t of asList(meta.tags)) tags.set(t, (tags.get(t) || 0) + 1);
      for (const e of asList(meta.entities)) entities.set(e, (entities.get(e) || 0) + 1);
    }
  }
  return { tags, entities };
}

// Groups terms that normalize identically, then links the remaining near-variants.
export function analyse(counts) {
  const terms = [...counts.keys()];
  const byNorm = new Map();
  for (const t of terms) {
    const n = normalize(t);
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(t);
  }
  const collisions = [...byNorm.values()].filter(g => g.length > 1);

  const norms = [...byNorm.keys()];
  const seen = new Set(), clusters = [];
  for (let i = 0; i < norms.length; i++) {
    if (seen.has(norms[i])) continue;
    const group = [norms[i]];
    for (let j = i + 1; j < norms.length; j++)
      if (!seen.has(norms[j]) && areVariants(norms[i], norms[j], byNorm.get(norms[i])[0], byNorm.get(norms[j])[0]))
        { group.push(norms[j]); seen.add(norms[j]); }
    if (group.length > 1) {
      seen.add(norms[i]);
      clusters.push(group.flatMap(n => byNorm.get(n))
        .map(t => ({ term: t, count: counts.get(t) }))
        .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term)));
    }
  }
  const singletons = terms.filter(t => counts.get(t) === 1).sort();
  return { total: terms.length, collisions, clusters, singletons };
}

export function loadVocabulary(root = ROOT) {
  const p = join(root, 'vocabulary.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('kb-vocab.mjs')) {
  const { tags, entities } = collect(ROOT);
  const t = analyse(tags), e = analyse(entities);
  const vocab = loadVocabulary(ROOT);
  const canon = new Set((vocab?.tags?.canonical || []).map(normalize));
  const aliases = vocab?.tags?.aliases || {};
  const offVocab = canon.size
    ? [...tags.keys()].filter(x => !canon.has(normalize(x)) && !(x in aliases)).sort()
    : [];
  const aliased = [...tags.keys()].filter(x => x in aliases).map(x => [x, aliases[x]]);

  if (JSON_OUT) {
    console.log(JSON.stringify({ tags: t, entities: e, offVocabulary: offVocab, aliasesInUse: aliased }, null, 2));
    process.exit(0);
  }

  const pct = t.total ? Math.round((t.singletons.length / t.total) * 100) : 0;
  console.log(`kb-vocab — tag & entity hygiene\n`);
  console.log(`Tags: ${t.total} · used once: ${t.singletons.length} (${pct}%)`);
  console.log(`Entities: ${e.total} · used once: ${e.singletons.length}\n`);

  const showClusters = (label, res) => {
    if (res.collisions.length) {
      console.log(`⚠ ${label}: same term, different spelling (${res.collisions.length}) — merge these:`);
      for (const g of res.collisions) console.log(`  ${g.join('  ·  ')}`);
      console.log('');
    }
    if (res.clusters.length) {
      console.log(`⚠ ${label}: near-variants (${res.clusters.length}) — likely one idea, pick a canonical:`);
      for (const g of res.clusters)
        console.log(`  ${g.map(x => `${x.term} (${x.count})`).join('  ·  ')}   → suggest: ${g[0].term}`);
      console.log('');
    }
  };
  showClusters('Tags', t);
  showClusters('Entities', e);

  if (canon.size) {
    if (offVocab.length) {
      console.log(`⚠ Off-vocabulary tags (${offVocab.length}) — not in vocabulary.json:`);
      console.log(`  ${offVocab.join(', ')}\n`);
    }
    if (aliased.length) {
      console.log(`· Aliases in use (${aliased.length}) — replace with the canonical term:`);
      for (const [from, to] of aliased) console.log(`  ${from} → ${to}`);
      console.log('');
    }
  } else {
    console.log('· No vocabulary.json — intrinsic checks only. Add one (see _templates/vocabulary.json)');
    console.log('  to also flag tags outside an agreed set.\n');
  }

  if (t.singletons.length) {
    console.log(`· Tags used exactly once (${t.singletons.length}) — a facet of one is rarely a facet:`);
    console.log(`  ${t.singletons.join(', ')}\n`);
  }

  const issues = t.collisions.length + t.clusters.length + e.collisions.length + e.clusters.length;
  console.log(issues ? `${issues} merge candidate(s). Nothing was changed — this tool never edits articles.`
                     : 'No merge candidates. Vocabulary is consistent.');
}
