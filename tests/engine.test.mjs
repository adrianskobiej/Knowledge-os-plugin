// Engine tests — black-box against the shipped reindex.mjs (zero deps, node --test).
// Stamps a fresh base from template/, runs the real engine, asserts behavior.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');

function makeBase() {
  const dir = mkdtempSync(join(tmpdir(), 'kb-base-'));
  cpSync(TEMPLATE, dir, { recursive: true });
  return dir;
}
function writeArticle(base, rel, fm, body = 'Body text.') {
  const front = '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n' + body + '\n';
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, front);
}
const reindex = (base, args = []) =>
  execFileSync('node', ['scripts/reindex.mjs', ...args], { cwd: base, encoding: 'utf8' });

// kb-data.js is `window.KB_DATA = {...};` — load the data object back.
function loadKbData(base) {
  const raw = readFileSync(join(base, 'kb-data.js'), 'utf8');
  return JSON.parse(raw.replace(/^window\.KB_DATA = /, '').replace(/;\s*$/, ''));
}

test('builds INDEX.md + kb-data.js and surfaces the author', () => {
  const base = makeBase();
  writeArticle(base, 'concepts/test.md', {
    title: 'Test', slug: 'test', category: 'concepts',
    summary: 'A test article long enough to pass the lint.', status: 'stable', author: 'adrian',
  });
  reindex(base);
  const idx = readFileSync(join(base, 'INDEX.md'), 'utf8');
  assert.match(idx, /\[Test\]\(concepts\/test\.md\)/);
  assert.match(idx, /by adrian/);
  const kb = readFileSync(join(base, 'kb-data.js'), 'utf8');
  assert.match(kb, /window\.KB_DATA = /);
  assert.match(kb, /"author": "adrian"/);
});

test('renderer drops javascript: links and escapes attribute breakout (XSS)', () => {
  const base = makeBase();
  writeArticle(base, 'concepts/x.md',
    { title: 'X', slug: 'x', category: 'concepts', summary: 'XSS payload article for testing renderer.', status: 'stable' },
    '[click](javascript:alert(1)) and [[y" onmouseover="alert(2)]]');
  reindex(base);
  const html = loadKbData(base).articles.find((a) => a.slug === 'x').html;
  assert.ok(!html.includes('javascript:'), 'javascript: scheme must be dropped to #');
  assert.ok(html.includes('href="#"'), 'the unsafe link href becomes #');
  assert.ok(!html.includes(' onmouseover="'), 'must not break out of an attribute with a raw quote');
  assert.ok(html.includes('&quot;'), 'double quotes are HTML-escaped');
});

test('kb-data.js escapes </script> so content cannot break out', () => {
  const base = makeBase();
  // summary is stored raw in kb-data (not HTML-escaped), so it exercises the </script> guard.
  writeArticle(base, 'concepts/s.md',
    { title: 'S', slug: 's', category: 'concepts', summary: 'Summary with </script> close tag inside it.', status: 'stable' });
  reindex(base);
  const kb = readFileSync(join(base, 'kb-data.js'), 'utf8');
  assert.ok(!kb.includes('</script>'), 'raw </script> must be neutralized');
  assert.ok(kb.includes('<\\/script>'), 'it should be in escaped form');
});

test('whitelist .gitignore ignores raw/ contents + stray files, tracks knowledge', () => {
  const base = makeBase();
  execFileSync('git', ['init', '-q'], { cwd: base });
  writeFileSync(join(base, 'raw', 'secret.txt'), 'SECRET=abc123');
  writeFileSync(join(base, 'stray.txt'), 'junk');
  writeArticle(base, 'concepts/keep.md',
    { title: 'Keep', slug: 'keep', category: 'concepts', summary: 'A kept article long enough to pass.', status: 'stable' });
  const ignored = (f) => {
    try { execFileSync('git', ['check-ignore', '-q', f], { cwd: base }); return true; } catch { return false; }
  };
  assert.ok(ignored('raw/secret.txt'), 'raw/ source must be ignored');
  assert.ok(ignored('stray.txt'), 'stray root file must be ignored');
  assert.ok(!ignored('concepts/keep.md'), 'knowledge must be tracked');
  assert.ok(!ignored('raw/.gitkeep'), 'raw/.gitkeep must be kept');
});

test('--lint flags missing required frontmatter', () => {
  const base = makeBase();
  writeArticle(base, 'concepts/bad.md',
    { title: 'Bad', slug: 'bad', category: 'concepts', status: 'stable' }); // no summary
  const out = reindex(base, ['--lint']);
  assert.match(out, /Missing field "summary"/);
});

test('viewer.html escapes slugs in backlink hrefs (no DOM XSS via slug)', () => {
  const viewer = readFileSync(join(TEMPLATE, 'viewer.html'), 'utf8');
  // backlink href must run the slug through escapeHtml, never concatenate it raw.
  assert.ok(viewer.includes("href=\"#' + escapeHtml(s) +"), 'backlink href must escape the slug');
  assert.ok(!/href="#' \+ s \+/.test(viewer), 'raw slug must not be concatenated into href');
});

test('--stats reports sections, authors and totals (writes nothing)', () => {
  const base = makeBase();
  writeArticle(base, 'concepts/a.md',
    { title: 'A', slug: 'a', category: 'concepts', summary: 'First article long enough to pass.', status: 'stable', author: 'adrian' });
  const out = reindex(base, ['--stats']);
  assert.match(out, /By section:/);
  assert.match(out, /By author:/);
  assert.match(out, /adrian: 1/);
  // The template ships built-in articles (e.g. the user guide, author "knowledge-os") —
  // assert relative to that so shipping more starter content never breaks this test.
  const totals = Number((out.match(/Totals: (\d+) articles/) || [])[1]);
  assert.ok(totals >= 1, 'totals line present and counts at least the created article');
  assert.match(out, /knowledge-os: 1/);
});

test('--lint flags stale articles and invalid config', () => {
  const base = makeBase();
  writeArticle(base, 'concepts/old.md',
    { title: 'Old', slug: 'old', category: 'concepts', summary: 'A stale article long enough to pass.', status: 'stable', updated: '2020-01-01' });
  writeFileSync(join(base, 'knowledge.config.json'), '{ not valid json');
  const out = reindex(base, ['--lint']);
  assert.match(out, /Stale \(updated 2020-01-01/);
  assert.match(out, /knowledge\.config\.json: missing or invalid JSON/);
});

test('--install-git-hook installs non-destructive auto-reindex hooks', () => {
  const base = makeBase();
  execFileSync('git', ['init', '-q'], { cwd: base });
  reindex(base, ['--install-git-hook']);
  const hook = readFileSync(join(base, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.match(hook, /knowledge-os auto-reindex/);
});
