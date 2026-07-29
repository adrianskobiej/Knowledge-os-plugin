// Capture-hook tests — black-box: feed each hook a real hook payload on stdin with an isolated
// HOME + base, and assert on stdout / the spool it leaves behind (zero deps).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** An isolated HOME with one registered base; returns { home, base }. */
function scaffold(config = {}) {
  const home = mkdtempSync(join(tmpdir(), 'kb-cap-'));
  const base = join(home, 'knowledge', 'acme');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'knowledge.config.json'), JSON.stringify({ company: { name: 'Acme' }, ...config }));
  mkdirSync(join(home, '.config', 'knowledge-os'), { recursive: true });
  writeFileSync(join(home, '.config', 'knowledge-os', 'bases.json'), JSON.stringify({ bases: [base] }));
  return { home, base };
}

/** Write a JSONL transcript: `turns` user prompts, plus a Write tool_use per entry of `writes`. */
function transcript(home, { turns = 0, writes = [] } = {}) {
  const rows = [];
  for (let i = 0; i < turns; i++) {
    rows.push({ type: 'user', message: { role: 'user', content: `prompt number ${i}` } });
    rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } });
    // a tool call + its result must not be counted as a user turn
    rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }] } });
    rows.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'data' }] } });
  }
  for (const f of writes) {
    rows.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: { file_path: f } }] } });
  }
  const path = join(mkdtempSync(join(tmpdir(), 'kb-tr-')), 'transcript.jsonl');
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
}

const runHook = (script, home, payload) =>
  execFileSync('node', [join(ROOT, 'scripts', script)], {
    input: JSON.stringify(payload), env: { ...process.env, HOME: home }, encoding: 'utf8',
  });

// ── kb-capture-nudge (UserPromptSubmit) ──────────────────────────────────────

test('nudge: silent outside a base', () => {
  const home = mkdtempSync(join(tmpdir(), 'kb-nobase-'));
  const out = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: '' });
  assert.equal(out.trim(), '');
});

test('nudge: names the configured orchestrator on the first prompt only', () => {
  const { home } = scaffold({ orchestrator: 'kratos' });
  const first = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 0 }) });
  assert.match(first, /orchestrator is `kratos`/);

  const later = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 3 }) });
  assert.doesNotMatch(later, /orchestrator/);
});

test('nudge: no orchestrator configured means no routing line', () => {
  const { home } = scaffold();
  const out = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 0 }) });
  assert.doesNotMatch(out, /orchestrator/);
});

test('nudge: fires on a long session that saved nothing, stays silent on a short one', () => {
  const { home } = scaffold();
  const short = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 5 }) });
  assert.equal(short.trim(), '');

  const long = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 10 }) });
  assert.match(long, /nothing has been saved to the knowledge base/);
});

test('nudge: fires past the threshold even when the turn count steps over it', () => {
  // Regression: an exact-equality trigger ((turns - 10) % 15 === 0) went silent for a whole
  // session as soon as the count skipped the trigger value — 11 turns nudged nobody.
  const { home } = scaffold();
  const out = runHook('kb-capture-nudge.mjs', home, { session_id: 's1', transcript_path: transcript(home, { turns: 11 }) });
  assert.match(out, /nothing has been saved to the knowledge base/);
});

test('nudge: does not repeat every turn once it has fired', () => {
  const { home } = scaffold();
  const first = runHook('kb-capture-nudge.mjs', home, { session_id: 's2', transcript_path: transcript(home, { turns: 12 }) });
  assert.match(first, /nothing has been saved/);

  const next = runHook('kb-capture-nudge.mjs', home, { session_id: 's2', transcript_path: transcript(home, { turns: 13 }) });
  assert.equal(next.trim(), '', 'silent one turn later');

  const later = runHook('kb-capture-nudge.mjs', home, { session_id: 's2', transcript_path: transcript(home, { turns: 27 }) });
  assert.match(later, /nothing has been saved/, 'fires again a cadence later');
});

test('nudge: one session having fired does not silence another', () => {
  const { home } = scaffold();
  runHook('kb-capture-nudge.mjs', home, { session_id: 'a', transcript_path: transcript(home, { turns: 12 }) });
  const other = runHook('kb-capture-nudge.mjs', home, { session_id: 'b', transcript_path: transcript(home, { turns: 12 }) });
  assert.match(other, /nothing has been saved/);
});

test('nudge: a session that already wrote to the base is never nudged', () => {
  const { home, base } = scaffold();
  const path = transcript(home, { turns: 10, writes: [join(base, 'projects', 'x.md')] });
  const out = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: path });
  assert.equal(out.trim(), '');
});

test('nudge: a write to a project file is not mistaken for a base write', () => {
  const { home } = scaffold();
  const path = transcript(home, { turns: 10, writes: ['/tmp/some-project/src/index.ts'] });
  const out = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: path });
  assert.match(out, /nothing has been saved/);
});

test('nudge: reports a pending backlog on the first prompt', () => {
  const { home, base } = scaffold();
  mkdirSync(join(base, '_pending'), { recursive: true });
  writeFileSync(join(base, '_pending', '2026-01-01-abc.md'), '# spool');
  const out = runHook('kb-capture-nudge.mjs', home, { cwd: home, transcript_path: transcript(home, { turns: 0 }) });
  assert.match(out, /1 session note\(s\) in `_pending\/`/);
});

// ── kb-session-capture (SessionEnd) ──────────────────────────────────────────

const spools = (base) => (existsSync(join(base, '_pending')) ? readdirSync(join(base, '_pending')) : []);

test('capture: spools a substantive session that saved nothing', () => {
  const { home, base } = scaffold();
  const path = transcript(home, { turns: 6, writes: ['/tmp/proj/app.ts'] });
  runHook('kb-session-capture.mjs', home, { cwd: '/tmp/proj', session_id: 'abcdef123456', transcript_path: path });

  const files = spools(base);
  assert.equal(files.length, 1, 'one spool written');
  const body = readFileSync(join(base, '_pending', files[0]), 'utf8');
  assert.match(body, /kind: pending-capture/);
  assert.match(body, /project: proj/);
  assert.match(body, /prompt number 0/);
  assert.match(body, /`\/tmp\/proj\/app\.ts`/);
});

test('capture: a session that already saved to the base leaves no duplicate', () => {
  const { home, base } = scaffold();
  const path = transcript(home, { turns: 6, writes: [join(base, 'projects', 'x.md')] });
  runHook('kb-session-capture.mjs', home, { cwd: '/tmp/proj', session_id: 'abc', transcript_path: path });
  assert.deepEqual(spools(base), [], 'no spool for a captured session');
});

test('capture: a short session is not spooled', () => {
  const { home, base } = scaffold();
  const path = transcript(home, { turns: 3 });
  runHook('kb-session-capture.mjs', home, { cwd: '/tmp/proj', session_id: 'abc', transcript_path: path });
  assert.deepEqual(spools(base), []);
});

test('capture: base files are excluded from the "files changed" list', () => {
  const { home, base } = scaffold();
  // a base write suppresses the spool entirely, so assert the exclusion via a second base
  const other = join(home, 'knowledge', 'other');
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, 'knowledge.config.json'), '{}');
  writeFileSync(join(home, '.config', 'knowledge-os', 'bases.json'), JSON.stringify({ bases: [base, other] }));

  const path = transcript(home, { turns: 6, writes: ['/tmp/proj/app.ts'] });
  runHook('kb-session-capture.mjs', home, { cwd: '/tmp/proj', session_id: 'abc', transcript_path: path });
  const body = readFileSync(join(base, '_pending', spools(base)[0]), 'utf8');
  assert.match(body, /`\/tmp\/proj\/app\.ts`/);
  assert.doesNotMatch(body, new RegExp(other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('capture: a missing transcript is survivable and writes nothing', () => {
  const { home, base } = scaffold();
  const out = runHook('kb-session-capture.mjs', home, { cwd: '/tmp/proj', session_id: 'abc', transcript_path: '/nope/none.jsonl' });
  assert.equal(out.trim(), '');
  assert.deepEqual(spools(base), []);
});
