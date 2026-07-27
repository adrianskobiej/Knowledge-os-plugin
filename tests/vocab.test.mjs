// Vocabulary tests — merge suggestions must be right more often than they are bold.
// A wrong suggestion is worse than a missed one: it invites someone to collapse a real
// distinction, and once two tags are merged the difference is gone from the base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, areVariants, analyse } from '../template/scripts/kb-vocab.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');

test('normalize folds case, separators and diacritics onto one key', () => {
  assert.equal(normalize('Lead-Gen'), normalize('lead gen'));
  assert.equal(normalize('sprzedaż'), normalize('sprzedaz'));
  assert.notEqual(normalize('website'), normalize('websites'));
});

test('flags plurals and misspellings of one term', () => {
  assert.ok(areVariants('website', 'websites'), 'plural');
  assert.ok(areVariants('sellnrise', 'servnrise'), 'one-letter misspelling of a product name');
  assert.ok(areVariants('procedura', 'procedury'), 'inflection');
});

test('does NOT flag a numbered series — those are deliberate values, not drift', () => {
  assert.ok(!areVariants('etap0', 'etap1'));
  assert.ok(!areVariants('etap0', 'etap9'));
  assert.ok(!areVariants('q1', 'q2'));
});

test('does NOT flag a narrower compound as a misspelling of the shorter term', () => {
  // `leads-method` ends with `ads-method` at edit distance 2. Merging them would erase
  // the difference between two real subjects.
  assert.ok(!areVariants('leadsmethod', 'adsmethod'));
  assert.ok(!areVariants('cofounder', 'founder'));
});

test('does NOT flag a general term as a misspelling of its own specialisation', () => {
  // `audyt` covers compliance, architecture and website audits; `audyt-ai` is one product.
  // Normalized they are one inflection apart — only the raw hyphen tells them apart.
  assert.ok(!areVariants('audyt', 'audytai', 'audyt', 'audyt-ai'));
  assert.ok(!areVariants('lead', 'leadmagnet', 'lead', 'lead-magnet'));
  // …but a plural of a hyphenated term is still a plural.
  assert.ok(areVariants('moneymodel', 'moneymodels', 'money-model', 'money-models'));
});

test('does NOT flag short tags, where a single edit links unrelated words', () => {
  assert.ok(!areVariants('www', 'vsl'));
  assert.ok(!areVariants('dev', 'des'));
});

test('analyse separates certain collisions from fuzzy clusters', () => {
  const counts = new Map([['sprzedaz', 3], ['sprzedaż', 1], ['website', 12], ['websites', 1], ['unique', 1]]);
  const r = analyse(counts);
  assert.equal(r.collisions.length, 1, 'diacritic pair is a certainty, not a guess');
  assert.deepEqual(r.collisions[0].sort(), ['sprzedaz', 'sprzedaż']);
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0][0].term, 'website', 'the more-used spelling leads the suggestion');
  assert.ok(r.singletons.includes('unique'));
});

test('reports over a real base and never edits it', () => {
  const base = mkdtempSync(join(tmpdir(), 'kb-vocab-'));
  cpSync(TEMPLATE, base, { recursive: true });
  const art = (rel, tags) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), `---\ntitle: T\nslug: ${rel.split('/').pop().replace(/\.md$/, '')}\ncategory: concepts\nsummary: A summary long enough for lint.\nstatus: stable\ntags: [${tags}]\n---\n\nBody.\n`);
  };
  art('concepts/a.md', 'website, kampania');
  art('concepts/b.md', 'websites');
  const before = JSON.stringify(execFileSync('ls', ['-R', base], { encoding: 'utf8' }));
  const out = execFileSync('node', ['scripts/kb-vocab.mjs'], { cwd: base, encoding: 'utf8' });
  assert.match(out, /website \(1\)\s+·\s+websites \(1\)/);
  assert.match(out, /never edits articles/);
  assert.equal(JSON.stringify(execFileSync('ls', ['-R', base], { encoding: 'utf8' })), before, 'no files added or removed');
});

test('reindex --lint reports a certain variant pair', () => {
  const base = mkdtempSync(join(tmpdir(), 'kb-vocab-lint-'));
  cpSync(TEMPLATE, base, { recursive: true });
  const art = (rel, tags) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), `---\ntitle: T\nslug: ${rel.split('/').pop().replace(/\.md$/, '')}\ncategory: concepts\nsummary: A summary long enough for lint.\nstatus: stable\ntags: [${tags}]\n---\n\nBody.\n`);
  };
  art('concepts/x.md', 'Lead-Gen');
  art('concepts/y.md', 'lead gen');
  const out = execFileSync('node', ['scripts/reindex.mjs', '--lint'], { cwd: base, encoding: 'utf8' });
  assert.match(out, /Tag variants of one term/);
});
