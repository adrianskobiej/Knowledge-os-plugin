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
import { join, dirname } from 'node:path';
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
