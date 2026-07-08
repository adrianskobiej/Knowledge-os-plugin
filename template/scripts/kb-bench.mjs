#!/usr/bin/env node
// kb-bench.mjs — retrieval-quality benchmark. Given eval/questions.json
// ([{ "q": "...", "expect": "slug" | ["slug", …] }]) it runs the same
// title/summary/tag retrieval an agent would, and reports recall@1/3/5 + MRR.
// Measures base health beyond link counts: can the base actually surface the
// right article for a question? Deterministic, zero dependencies.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

let articles = [];
try {
  const raw = readFileSync(join(ROOT, 'kb-data.js'), 'utf8').replace(/^window\.KB_DATA\s*=\s*/, '').replace(/;\s*$/, '');
  articles = JSON.parse(raw).articles.filter(a => a.status !== 'archived');
} catch { console.error('✗ kb-data.js not found — run `node scripts/reindex.mjs` first.'); process.exit(1); }

const evalPath = existsSync(join(ROOT, 'eval/questions.json')) ? 'eval/questions.json'
  : existsSync(join(ROOT, 'eval/questions.example.json')) ? 'eval/questions.example.json' : null;
if (!evalPath) { console.error('✗ No eval set — create eval/questions.json as [{"q":"…","expect":"slug"}].'); process.exit(1); }
let questions;
try { questions = JSON.parse(readFileSync(join(ROOT, evalPath), 'utf8')); }
catch (e) { console.error(`✗ ${evalPath}: ${e.message}`); process.exit(1); }
if (!Array.isArray(questions) || !questions.length) { console.error(`✗ ${evalPath} is empty.`); process.exit(1); }

// Polish + English stopwords — short glue words that shouldn't drive retrieval.
const STOP = new Set('a i o u w z do na po od co jak czy the of to is are and or for in on at jest ma sie nie za dla by byc ktory ktora ktore gdzie kto our we how what'.split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokenize = s => [...new Set(norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t)))];

// Same signal an agent uses scanning INDEX: title/slug (strong), tags/aka/entities, summary.
function score(a, terms) {
  const title = norm(a.title), slug = norm(a.slug), summ = norm(a.summary);
  const meta = norm([...(a.tags || []), ...(a.aka || []), ...(a.entities || [])].join(' '));
  let s = 0;
  for (const t of terms) {
    if (title.includes(t) || slug.includes(t)) s += 3;
    else if (meta.includes(t)) s += 2;
    else if (summ.includes(t)) s += 1;
  }
  return s;
}
const rank = q => {
  const terms = tokenize(q);
  return articles.map(a => ({ slug: a.slug, s: score(a, terms) }))
    .filter(x => x.s > 0)
    .sort((x, y) => y.s - x.s || x.slug.localeCompare(y.slug));
};

let r1 = 0, r3 = 0, r5 = 0, mrr = 0, n = 0;
const rows = [];
for (const item of questions) {
  const expect = Array.isArray(item.expect) ? item.expect : [item.expect];
  const ranked = rank(item.q);
  const pos = ranked.findIndex(r => expect.includes(r.slug));  // 0-based, -1 = miss
  const at = pos === -1 ? Infinity : pos + 1;
  n++;
  if (at <= 1) r1++; if (at <= 3) r3++; if (at <= 5) r5++;
  if (pos >= 0) mrr += 1 / (pos + 1);
  rows.push({ q: item.q, expect: expect.join('|'), at: pos === -1 ? '—' : at, top: ranked.slice(0, 3).map(r => r.slug).join(', ') });
}
const pct = x => `${(100 * x / n).toFixed(0)}%`;
console.log(`\n📊 Retrieval benchmark — ${n} question(s) · source: ${evalPath}\n`);
for (const r of rows)
  console.log(`  ${r.at === 1 ? '✓' : r.at === '—' ? '✗ MISS' : '·'} @${String(r.at).padEnd(3)} expect: ${r.expect}\n      q: ${r.q}\n      top3: ${r.top || '(no hits)'}`);
console.log(`\n  recall@1 ${pct(r1)} · recall@3 ${pct(r3)} · recall@5 ${pct(r5)} · MRR ${(mrr / n).toFixed(3)}\n`);
