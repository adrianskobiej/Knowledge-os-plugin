// Chat-runtime tests — the gates around a server that runs an agent on your machine.
//
// Every other script in this repo reads and writes files. This one opens a port and executes a
// command, which makes its refusals the interesting part: a localhost port is reachable by every
// page the browser has open, so "only my viewer may talk to this" has to be provable, not assumed.
// No turn is ever started here — spawning a real agent is not a unit test.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');
const PORT = 4587;                       // fixed but unusual — the runtime takes a port, not a socket
const BASE = `http://127.0.0.1:${PORT}`;

let base, proc, token;

before(async () => {
  base = mkdtempSync(join(tmpdir(), 'kb-chat-'));
  cpSync(TEMPLATE, base, { recursive: true });
  proc = spawn(process.execPath, [join(base, 'scripts', 'kb-chat.mjs'), '--port', String(PORT)],
    { cwd: base, stdio: ['ignore', 'pipe', 'pipe'] });
  token = await new Promise((ok, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error('runtime did not start: ' + out)), 10_000);
    proc.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/\?t=([a-f0-9]+)/);
      if (m) { clearTimeout(timer); ok(m[1]); }
    });
    proc.on('error', fail);
  });
});

after(() => {
  try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* temp dir */ }
});

test('answers the viewer it handed the token to', async () => {
  const r = await fetch(`${BASE}/api/ping?t=${token}`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.permissionMode, 'acceptEdits');   // safe-by-default: edits yes, shell still gated
});

test('refuses a request without the token', async () => {
  assert.equal((await fetch(`${BASE}/api/ping`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/ping?t=wrong`)).status, 401);
});

test('refuses another site fetching it', async () => {
  const r = await fetch(`${BASE}/api/ping?t=${token}`, { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(r.status, 403);
});

test('refuses a rebound hostname', async () => {
  // The browser resolves attacker.example to 127.0.0.1 and keeps sending its own Host header —
  // the token would travel with it, so the Host check is what actually stops this. fetch() is not
  // allowed to forge a Host header, hence the raw request.
  const status = await new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: PORT, path: `/api/ping?t=${token}`,
      headers: { Host: 'attacker.example' } }, (res) => { res.resume(); ok(res.statusCode); });
    req.on('error', fail);
    req.end();
  });
  assert.equal(status, 403);
});

test('serves nothing outside the base', async () => {
  for (const path of ['/../../etc/passwd', '/%2e%2e%2f%2e%2e%2fetc%2fpasswd', '/scripts/../../../etc/passwd']) {
    const r = await fetch(`${BASE}${path}?t=${token}`);
    assert.ok(r.status === 403 || r.status === 404, `${path} returned ${r.status}`);
  }
});

test('hands kb-data.js the token too', async () => {
  // The one file with every article in it must not be loadable by a page that merely guessed
  // the port — so the viewer's own <script src> is rewritten on the way out.
  const html = await (await fetch(`${BASE}/viewer.html?t=${token}`)).text();
  assert.match(html, new RegExp(`src="kb-data\\.js\\?t=${token}"`));
  assert.match(html, new RegExp(`window\\.KB_CHAT=\\{token:"${token}"\\}`));
  assert.equal((await fetch(`${BASE}/kb-data.js`)).status, 401);
});

test('rejects a turn with nothing to say', async () => {
  const post = (body) => fetch(`${BASE}/api/send?t=${token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post({ channel: 'base' })).status, 400);
  assert.equal((await post({ text: 'hello' })).status, 400);
});

test('a thread that was never opened reads as empty, not as an error', async () => {
  const r = await fetch(`${BASE}/api/threads?channel=agent:nobody&t=${token}`);
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).messages, []);
});

test('streaming a run that does not exist is a 404, not a hanging socket', async () => {
  const r = await fetch(`${BASE}/api/events?run=nope&t=${token}`);
  assert.equal(r.status, 404);
  await r.text();
});

// ── channels ────────────────────────────────────────────────────────────────
// A channel names a folder an agent will run in, so creating one is the closest thing this
// runtime has to a privileged operation. Every rejection below is the reason it stays boring.

const channels = () => fetch(`${BASE}/api/channels?t=${token}`).then((r) => r.json());
const addChannel = (body) => fetch(`${BASE}/api/channels?t=${token}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('the base is always a channel, and it runs in the base', async () => {
  const list = await channels();
  const home = list.find((c) => c.id === 'base');
  assert.ok(home, 'no base channel');
  assert.equal(home.inBase, true);
});

test('creates a channel for a folder and remembers it', async () => {
  const r = await addChannel({ name: 'Scratch Room', path: tmpdir() });
  assert.equal(r.status, 200);
  const made = await r.json();
  assert.equal(made.kind, 'custom');
  assert.ok((await channels()).some((c) => c.id === made.id && c.inBase === false));
});

test('refuses a folder that is not one', async () => {
  assert.equal((await addChannel({ name: 'Ghost', path: join(tmpdir(), 'kb-chat-no-such-dir') })).status, 400);
  assert.equal((await addChannel({ name: 'File', path: join(base, 'knowledge.config.json') })).status, 400);
  assert.equal((await addChannel({ name: 'Root', path: '/' })).status, 400);
  assert.equal((await addChannel({ path: tmpdir() })).status, 400);           // nameless
});

test('a derived channel cannot be deleted from the chat window', async () => {
  const r = await fetch(`${BASE}/api/channels?id=base&t=${token}`, { method: 'DELETE' });
  assert.equal(r.status, 400);
  assert.ok((await channels()).some((c) => c.id === 'base'));
});

test('a hand-made channel can be, and takes its transcript with it', async () => {
  const made = await (await addChannel({ name: 'Temporary', path: tmpdir() })).json();
  const del = await fetch(`${BASE}/api/channels?id=${encodeURIComponent(made.id)}&t=${token}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.ok(!(await channels()).some((c) => c.id === made.id));
});

test('offers the folders it knows about, marking the ones already taken', async () => {
  const r = await fetch(`${BASE}/api/folders?t=${token}`);
  assert.equal(r.status, 200);
  const found = await r.json();
  assert.ok(Array.isArray(found));
  for (const f of found) {
    assert.ok(f.path && f.name, 'a folder needs a path and a name');
    assert.equal(typeof f.used, 'boolean');
    assert.ok(!f.path.includes(`${sep}.claude${sep}worktrees${sep}`), 'worktrees are not projects');
    assert.ok(!f.path.startsWith(base + sep) && f.path !== base, 'the base is already a channel');
  }
});

// ── billing ─────────────────────────────────────────────────────────────────
// `claude` bills to an API key when one is in its environment and to the signed-in subscription
// otherwise. A stray export in a shell profile would therefore move every chat turn onto
// pay-per-token without anyone noticing, so the runtime withholds the key rather than inheriting it.

test('reports that turns run on the subscription', async () => {
  const s = await (await fetch(`${BASE}/api/ping?t=${token}`)).json();
  assert.equal(s.billing, 'subscription');
  assert.equal(s.keyInEnv, false);
});

test('an API key in the environment is reported, not adopted', async () => {
  const port = PORT + 1;
  const child = spawn(process.execPath, [join(base, 'scripts', 'kb-chat.mjs'), '--port', String(port)],
    { cwd: base, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ANTHROPIC_API_KEY: 'sk-ant-not-a-real-key' } });
  try {
    const tok = await new Promise((ok, fail) => {
      let out = '';
      const timer = setTimeout(() => fail(new Error('runtime did not start: ' + out)), 10_000);
      child.stdout.on('data', (c) => {
        out += c;
        const m = out.match(/\?t=([a-f0-9]+)/);
        if (m) { clearTimeout(timer); ok(m[1]); }
      });
      child.on('error', fail);
    });
    const s = await (await fetch(`http://127.0.0.1:${port}/api/ping?t=${tok}`)).json();
    assert.equal(s.keyInEnv, true, 'the key should be visible to the runtime');
    assert.equal(s.billing, 'subscription', 'but must not become the billing path');
  } finally { try { child.kill('SIGTERM'); } catch { /* already gone */ } }
});

test('a turn for a channel that does not exist never reaches the agent', async () => {
  const r = await fetch(`${BASE}/api/send?t=${token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'project:imaginary', text: 'do something' }),
  });
  assert.equal(r.status, 404);
});
