// Retraction tests — removing knowledge must leave the graph intact.
//
// The failure this guards against is quiet: a plain delete leaves every [[reference]]
// dangling, reindex reports each as a dead link, and once lint is noisy nobody reads it.
// So the interesting assertions are about what happens to the REFERENCES, not the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');

function art(base, rel, fm, body = 'Body text long enough for the linter.') {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n' + body + '\n');
}
function makeBase() {
  const base = mkdtempSync(join(tmpdir(), 'kb-forget-'));
  cpSync(TEMPLATE, base, { recursive: true });
  const f = (slug, extra = {}) => ({ title: slug, slug, category: 'concepts', summary: `Article ${slug} with a long enough summary.`, status: 'stable', ...extra });
  art(base, 'concepts/old.md', f('old'));
  art(base, 'concepts/new.md', f('new'));
  art(base, 'concepts/citer.md', f('citer', { depends_on: '[old]' }), 'We rely on [[old]] and also on [[old|the old way]].');
  return base;
}
const forget = (base, args) => {
  const r = spawnSync('node', ['scripts/kb-forget.mjs', ...args], { cwd: base, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

test('dry run is the default and writes nothing', () => {
  const base = makeBase();
  const r = forget(base, ['old']);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry run/);
  assert.ok(existsSync(join(base, 'concepts/old.md')), 'the article must survive a preview');
  assert.match(readFileSync(join(base, 'concepts/citer.md'), 'utf8'), /\[\[old\]\]/);
});

test('without a replacement, references become honest plain text', () => {
  const base = makeBase();
  assert.equal(forget(base, ['old', '--apply']).code, 0);
  const citer = readFileSync(join(base, 'concepts/citer.md'), 'utf8');
  assert.ok(!existsSync(join(base, 'concepts/old.md')));
  assert.match(citer, /old \(retracted\)/);
  assert.match(citer, /the old way \(retracted\)/, 'the label is kept, so the sentence still reads');
  assert.ok(!citer.includes('[[old]]'), 'no dangling reference may survive');
  assert.ok(!/^depends_on:/m.test(citer), 'a relation with nothing left points nowhere — the field goes');
});

test('with a replacement, references are redirected and the trail is recorded', () => {
  const base = makeBase();
  assert.equal(forget(base, ['old', '--replaced-by', 'new', '--apply']).code, 0);
  const citer = readFileSync(join(base, 'concepts/citer.md'), 'utf8');
  assert.match(citer, /\[\[new\|old\]\]/, 'reference redirected, original wording kept');
  assert.match(citer, /^depends_on: \[new\]$/m, 'the dependency now points at the replacement');
  assert.match(readFileSync(join(base, 'concepts/new.md'), 'utf8'), /^supersedes: \[old\]$/m,
    'the replacement records what it replaced — the trail outlives the deleted file');
});

test('a retraction leaves no dead links behind', () => {
  const base = makeBase();
  forget(base, ['old', '--apply']);
  const out = execFileSync('node', ['scripts/reindex.mjs', '--lint'], { cwd: base, encoding: 'utf8' });
  assert.ok(!/Dead link \[\[old\]\]/.test(out), 'this is the whole point of the tool');
});

test('refuses to redirect at an article that does not exist', () => {
  const base = makeBase();
  const r = forget(base, ['old', '--replaced-by', 'ghost', '--apply']);
  assert.equal(r.code, 2);
  assert.match(r.out, /refusing to point references at nothing/);
  assert.ok(existsSync(join(base, 'concepts/old.md')), 'a refused run changes nothing');
});

test('a slug inside a code fence is an example, not a reference', () => {
  const base = makeBase();
  art(base, 'concepts/doc.md', { title: 'doc', slug: 'doc', category: 'concepts', summary: 'Shows the syntax in an example block.', status: 'stable' },
    'Write it like this:\n\n```\n[[old]]\n```\n');
  forget(base, ['old', '--apply']);
  assert.match(readFileSync(join(base, 'concepts/doc.md'), 'utf8'), /\[\[old\]\]/, 'code fences are left alone');
});

test('reindex flags a relation pointing at nothing', () => {
  const base = makeBase();
  art(base, 'concepts/broken.md', { title: 'broken', slug: 'broken', category: 'concepts', summary: 'Depends on something that is not there.', status: 'stable', depends_on: '[ghost]' });
  const out = execFileSync('node', ['scripts/reindex.mjs', '--lint'], { cwd: base, encoding: 'utf8' });
  assert.match(out, /Unknown depends_on target "ghost"/);
});

test('typed relations reach the graph as their own edge kind', () => {
  const base = makeBase();
  execFileSync('node', ['scripts/reindex.mjs'], { cwd: base, encoding: 'utf8' });
  const graph = JSON.parse(readFileSync(join(base, 'graph.json'), 'utf8'));
  const dep = graph.edges.find(e => e.relation === 'depends_on');
  assert.ok(dep, 'a dependency must be distinguishable from a mention');
  assert.equal(dep.source, 'citer');
  assert.equal(dep.target, 'old');
});
