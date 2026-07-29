#!/usr/bin/env node
// kb-chat.mjs — the base's chat runtime: a localhost bridge between viewer.html and Claude Code.
//
// The viewer has always been an offline document: open the file, read the base, close it. Reading
// is only half of the loop though — the other half is asking, and until now asking meant leaving
// the base and opening a terminal. This server keeps the viewer where it is and adds the missing
// half: a channel per assistant, a thread per conversation, and a real Claude Code session behind
// each one, running in the base with every skill, agent and MCP the terminal would have.
//
// Zero dependencies. It is deliberately a *local* tool: it binds to the loopback interface, mints a
// fresh token on every start, and refuses any request that did not come from the page it served.
//
// Usage:  node scripts/kb-chat.mjs [--port 4319] [--open] [--no-token]
//
// Config (knowledge.config.json, all optional):
//   "chat": {
//     "port": 4319,
//     "permissionMode": "acceptEdits",      // default | acceptEdits | plan | bypassPermissions
//     "model": "",                          // "" = whatever `claude` is configured to use
//     "allowedTools": [],
//     "disallowedTools": ["Bash(git push:*)", "Bash(rm:*)"],
//     "timeoutMinutes": 15,
//     "maxConcurrent": 3
//   }

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT, '.kb-chat');
const THREADS_FILE = join(STATE_DIR, 'threads.json');
const CHANNELS_FILE = join(STATE_DIR, 'channels.json');

// ── config ──────────────────────────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(readFileSync(join(ROOT, 'knowledge.config.json'), 'utf8')); }
  catch { return {}; }
}
const config = loadConfig();
const chatCfg = config.chat || {};
const argv = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PORT = Number(argVal('--port', chatCfg.port || 4319));
const OPEN = argv.includes('--open');
// --no-token exists for the case where the viewer is proxied by something else that already
// authenticates. It is never the default: an unauthenticated port on localhost is readable by
// any page the browser happens to have open.
const TOKEN = argv.includes('--no-token') ? '' : randomBytes(16).toString('hex');
const PERMISSION_MODE = String(chatCfg.permissionMode || 'acceptEdits');
const MODEL = String(chatCfg.model || '');
const ALLOWED_TOOLS = Array.isArray(chatCfg.allowedTools) ? chatCfg.allowedTools : [];
const DISALLOWED_TOOLS = Array.isArray(chatCfg.disallowedTools)
  ? chatCfg.disallowedTools
  : ['Bash(git push:*)', 'Bash(rm:*)'];
const TIMEOUT_MS = Math.max(1, Number(chatCfg.timeoutMinutes || 15)) * 60_000;
const MAX_CONCURRENT = Math.max(1, Number(chatCfg.maxConcurrent || 3));
// Which account pays. `claude` bills to a metered API key when one is in the environment and to
// the signed-in subscription otherwise — a distinction a chat window must not make by accident,
// because a stray export in a shell profile would silently move every turn onto pay-per-token.
// Default: keep the key out of the child's environment. Set "api" to opt into metered billing.
const BILLING = chatCfg.billing === 'api' ? 'api' : 'subscription';
const KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];
function childEnv() {
  if (BILLING === 'api') return process.env;
  const env = { ...process.env };
  for (const k of KEY_VARS) delete env[k];
  return env;
}

// ── thread store ────────────────────────────────────────────────────────────
// One file, rewritten on change. Threads are small (text + a session id) and a chat log that
// survives a restart is worth more than the milliseconds an append-only format would save.
function loadThreads() {
  try { return JSON.parse(readFileSync(THREADS_FILE, 'utf8')); } catch { return {}; }
}
let threads = loadThreads();
function saveThreads() {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(THREADS_FILE, JSON.stringify(threads, null, 2));
  } catch (err) { console.error('kb-chat: could not persist threads —', err.message); }
}
function thread(id) {
  return (threads[id] ??= { id, sessionId: null, messages: [], updated: null });
}

// ── channels ────────────────────────────────────────────────────────────────
// A channel is a place to talk plus a folder to talk *in*. Three sources, one list:
//   · the base itself and every card in assistants/  — derived, always present
//   · every article in projects/ carrying a `folder:` — derived, so a project you already
//     documented becomes a room without being registered twice
//   · anything you add by hand in the viewer            — stored in .kb-chat/channels.json
// The server owns this list because only the server may decide which folder an agent runs in.
function frontmatter(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const meta = {};
  for (const line of raw.slice(3, end).split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

function zoneCards(zone, pattern) {
  const dir = join(ROOT, zone);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && pattern.test(f))
    .map((f) => ({ file: join(dir, f), meta: frontmatter(join(dir, f)) }))
    .filter((x) => x.meta && x.meta.slug);
}

// `~` is what a person types; the runtime has to resolve it before it can check anything.
function expandPath(p) {
  const s = String(p || '').trim();
  if (!s) return '';
  return resolve(s.startsWith('~') ? join(homedir(), s.slice(1)) : s);
}

function loadStoredChannels() {
  try {
    const list = JSON.parse(readFileSync(CHANNELS_FILE, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
let storedChannels = loadStoredChannels();
function saveChannels() {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CHANNELS_FILE, JSON.stringify(storedChannels, null, 2));
  } catch (err) { console.error('kb-chat: could not persist channels —', err.message); }
}

function listChannels() {
  const out = [{ id: 'base', name: 'Base', kind: 'base', path: ROOT, agent: '',
                 desc: 'The whole knowledge base' }];
  for (const { meta } of zoneCards('assistants', /^assistant-.+\.md$/)) {
    const agent = meta.slug.replace(/^assistant-/, '');
    out.push({ id: 'agent:' + agent, kind: 'agent', agent, path: ROOT,
               name: meta.name || (meta.title || agent).split(/\s+[—–-]\s+/)[0],
               desc: meta.position || meta.summary || '' });
  }
  for (const { meta } of zoneCards('projects', /.+\.md$/)) {
    const folder = expandPath(meta.folder);
    if (!folder || !existsSync(folder)) continue;   // a project without a folder is an article, not a room
    out.push({ id: 'project:' + meta.slug, kind: 'project', agent: meta.agent || '',
               path: folder, name: meta.title || meta.slug, desc: folder });
  }
  const seen = new Set(out.map((c) => c.id));
  for (const c of storedChannels) {
    if (seen.has(c.id)) continue;                   // a hand-made channel never shadows a derived one
    out.push({ ...c, kind: c.kind || 'custom' });
  }
  return out;
}
const channelById = (id) => listChannels().find((c) => c.id === id) || null;

// ── runs ────────────────────────────────────────────────────────────────────
/** runId -> { channel, proc, listeners:Set<res>, events:[], done:boolean } */
const runs = new Map();
/** channel -> runId — one live turn per channel, the way a person answers one question at a time. */
const busy = new Map();

function emit(run, event) {
  run.events.push(event);
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of run.listeners) { try { res.write(frame); } catch { /* client vanished */ } }
}

function startRun({ channel, prompt, cwd, agent }) {
  const t = thread(channel);
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  // In a project channel the agent works in the project, but the base is what it knows from —
  // so the knowledge base travels along as a second working directory. This is the whole reason
  // an assistant behaves the same in a project room as it does in the base.
  if (cwd !== ROOT) args.push('--add-dir', ROOT);
  if (t.sessionId) args.push('--resume', t.sessionId);
  if (MODEL) args.push('--model', MODEL);
  if (PERMISSION_MODE) args.push('--permission-mode', PERMISSION_MODE);
  for (const tool of ALLOWED_TOOLS) args.push('--allowedTools', tool);
  for (const tool of DISALLOWED_TOOLS) args.push('--disallowedTools', tool);

  const proc = spawn('claude', args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const runId = randomBytes(8).toString('hex');
  const run = { channel, proc, listeners: new Set(), events: [], done: false };
  runs.set(runId, run);
  busy.set(channel, runId);

  // The prompt goes over stdin, not argv: a pasted transcript can be longer than the shell's
  // argument limit, and nothing about it then needs escaping.
  proc.stdin.end(prompt);

  const timer = setTimeout(() => {
    emit(run, { type: 'error', message: `Timed out after ${TIMEOUT_MS / 60_000} min — the turn was stopped.` });
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  }, TIMEOUT_MS);

  let buf = '';
  let text = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }   // a non-JSON line is noise, not an error
      if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
        t.sessionId = ev.session_id;                        // resume target for the next turn
        emit(run, { type: 'session', sessionId: ev.session_id, model: ev.model });
      } else if (ev.type === 'assistant' && ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'text' && block.text) { text += block.text; emit(run, { type: 'text', text: block.text }); }
          else if (block.type === 'tool_use') emit(run, { type: 'tool', name: block.name });
        }
      } else if (ev.type === 'result') {
        if (ev.subtype !== 'success' && ev.result) emit(run, { type: 'error', message: String(ev.result) });
        else if (!text && ev.result) { text = String(ev.result); emit(run, { type: 'text', text }); }
      }
    }
  });

  let stderr = '';
  proc.stderr.on('data', (chunk) => { stderr += chunk; });

  proc.on('error', (err) => {
    emit(run, {
      type: 'error',
      message: err.code === 'ENOENT'
        ? 'The `claude` command was not found on PATH — install Claude Code, or start this server from a shell that has it.'
        : err.message,
    });
  });

  proc.on('close', (code) => {
    clearTimeout(timer);
    if (code !== 0 && !text) emit(run, { type: 'error', message: stderr.trim() || `claude exited with code ${code}` });
    // Who answered is recorded next to what was said — in a project room the channel is the
    // project, so without this the transcript would credit every reply to the room.
    t.messages.push({ role: 'assistant', agent: agent || '', text, at: new Date().toISOString() });
    t.updated = new Date().toISOString();
    saveThreads();
    run.done = true;
    emit(run, { type: 'done' });
    for (const res of run.listeners) { try { res.end(); } catch { /* ignore */ } }
    run.listeners.clear();
    busy.delete(channel);
    // Keep the finished run around briefly so a slow client can still replay it.
    setTimeout(() => runs.delete(runId), 60_000).unref?.();
  });

  return runId;
}

// ── http ────────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8' });

// Two gates, because a port on localhost is not private. A Host header that is not loopback is a
// DNS-rebinding attempt; a cross-site fetch is another page on the machine going fishing. Neither
// can be a legitimate request from the viewer this server just handed out.
function guard(req, res, url) {
  const host = (req.headers.host || '').split(':')[0];
  if (host && !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) {
    send(res, 403, 'Bad Host — this server only answers to localhost.');
    return false;
  }
  if ((req.headers['sec-fetch-site'] || '') === 'cross-site') {
    send(res, 403, 'Cross-site requests are not accepted.');
    return false;
  }
  if (!TOKEN) return true;
  const given = req.headers['x-kb-token'] || url.searchParams.get('t') || '';
  if (given !== TOKEN) { send(res, 401, 'Missing or wrong token — open the URL printed by ./kb chat.'); return false; }
  return true;
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) { fail(new Error('Request body too large')); req.destroy(); }
    });
    req.on('end', () => ok(data));
    req.on('error', fail);
  });
}

function serveStatic(res, pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'viewer.html';
  const file = resolve(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Outside the base.');
  const ext = extname(file).toLowerCase();
  if (!MIME[ext]) return send(res, 404, 'Not found.');
  if (!existsSync(file)) return send(res, 404, 'Not found.');

  // viewer.html is rewritten on the way out: its sibling <script src="kb-data.js"> has to carry
  // the token too, or the one file holding every article stays readable by any page that guesses
  // the port. The same injection tells the viewer it is running with a live backend.
  if (ext === '.html') {
    let html = readFileSync(file, 'utf8');
    if (TOKEN) html = html.replace(/(src=")(kb-data\.js)(")/g, `$1$2?t=${TOKEN}$3`);
    html = html.replace('</head>', `<script>window.KB_CHAT={token:${JSON.stringify(TOKEN)}};</script></head>`);
    return send(res, 200, html, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
  }
  res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (!guard(req, res, url)) return;

  if (url.pathname === '/api/ping') {
    return sendJson(res, 200, {
      ok: true, root: ROOT, permissionMode: PERMISSION_MODE, model: MODEL || 'default',
      version: config.version || '', threads: Object.keys(threads).length,
      billing: BILLING, keyInEnv: KEY_VARS.some((k) => !!process.env[k]),
    });
  }

  if (url.pathname === '/api/threads' && req.method === 'GET') {
    const id = url.searchParams.get('channel');
    return sendJson(res, 200, id ? (threads[id] || { id, messages: [] }) : threads);
  }

  if (url.pathname === '/api/reset' && req.method === 'POST') {
    // Forget the session id, keep the transcript — "start fresh" should not erase what was said.
    const id = url.searchParams.get('channel') || '';
    if (threads[id]) { threads[id].sessionId = null; saveThreads(); }
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/send' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch (err) { return sendJson(res, 400, { error: err.message }); }
    const channel = String(body.channel || '').trim();
    const text = String(body.text || '').trim();
    if (!channel || !text) return sendJson(res, 400, { error: 'channel and text are required' });
    if (busy.has(channel)) return sendJson(res, 409, { error: 'This channel is still answering the previous message.' });
    if (busy.size >= MAX_CONCURRENT) return sendJson(res, 429, { error: `Already running ${busy.size} turns — wait for one to finish.` });

    const chan = channelById(channel);
    if (!chan) return sendJson(res, 404, { error: 'No such channel.' });
    if (!existsSync(chan.path)) return sendJson(res, 400, { error: `The channel folder is gone: ${chan.path}` });

    const t = thread(channel);
    t.messages.push({ role: 'user', text, at: new Date().toISOString() });
    t.updated = new Date().toISOString();
    saveThreads();

    // The agent name is prepended as a mention rather than passed as a flag: the base's own
    // mention layer is what decides which employee answers, so the routing rule stays in one
    // place instead of being duplicated here. A `@name` the person typed themselves wins over
    // the channel's default — summoning someone into a room is the point.
    const typed = text.match(/(?:^|\s)@([a-z0-9-]{2,})\b/i);
    const fallback = typed ? '' : String(body.agent ?? chan.agent ?? '').trim();
    const agent = typed ? typed[1].toLowerCase() : fallback;
    const prompt = fallback ? `@${fallback}\n\n${text}` : text;
    let runId;
    try { runId = startRun({ channel, prompt, cwd: chan.path, agent }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
    return sendJson(res, 200, { runId, cwd: chan.path, agent });
  }

  if (url.pathname === '/api/channels' && req.method === 'GET') {
    return sendJson(res, 200, listChannels().map((c) => ({
      ...c, inBase: c.path === ROOT, updated: (threads[c.id] || {}).updated || null,
    })));
  }

  if (url.pathname === '/api/channels' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch (err) { return sendJson(res, 400, { error: err.message }); }
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: 'A channel needs a name.' });
    const path = body.path ? expandPath(body.path) : ROOT;
    // The folder decides where an agent will run, so it is checked here rather than trusted:
    // a typo should fail now, not halfway through a turn.
    if (!existsSync(path)) return sendJson(res, 400, { error: `No such folder: ${path}` });
    if (!statSync(path).isDirectory()) return sendJson(res, 400, { error: `Not a folder: ${path}` });
    if (path === sep) return sendJson(res, 400, { error: 'The filesystem root is not a working directory.' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'channel';
    let id = 'custom:' + slug;
    for (let n = 2; channelById(id); n++) id = `custom:${slug}-${n}`;
    const chan = { id, name, kind: 'custom', path, agent: String(body.agent || '').trim() };
    storedChannels.push(chan);
    saveChannels();
    console.log(`  + channel "${name}" → ${path}`);
    return sendJson(res, 200, chan);
  }

  if (url.pathname === '/api/channels' && req.method === 'DELETE') {
    // Only hand-made channels can be removed — a derived one would simply come back on the next
    // read, and deleting the article behind it is a decision for the base, not for a chat window.
    const id = url.searchParams.get('id') || '';
    const before = storedChannels.length;
    storedChannels = storedChannels.filter((c) => c.id !== id);
    if (storedChannels.length === before) return sendJson(res, 400, { error: 'That channel is derived from the base — remove it there.' });
    saveChannels();
    delete threads[id];
    saveThreads();
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/events') {
    const run = runs.get(url.searchParams.get('run') || '');
    if (!run) return send(res, 404, 'No such run.');
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store', connection: 'keep-alive',
    });
    for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);   // replay, then follow
    if (run.done) return res.end();
    run.listeners.add(res);
    req.on('close', () => run.listeners.delete(res));
    return;
  }

  if (url.pathname === '/api/stop' && req.method === 'POST') {
    const run = runs.get(url.searchParams.get('run') || '');
    if (run) { try { run.proc.kill('SIGTERM'); } catch { /* already gone */ } }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'GET') return send(res, 405, 'Method not allowed.');
  return serveStatic(res, url.pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/viewer.html${TOKEN ? `?t=${TOKEN}` : ''}`;
  console.log(`\n  💬 Chat runtime for ${config.company?.name || 'the base'}`);
  console.log(`     ${url}`);
  console.log(`     permission mode: ${PERMISSION_MODE}${DISALLOWED_TOOLS.length ? ` · denied: ${DISALLOWED_TOOLS.join(', ')}` : ''}`);
  const keyed = KEY_VARS.filter((k) => !!process.env[k]);
  console.log(`     billing: ${BILLING === 'api' ? 'metered API key' : 'your signed-in Claude subscription'}`
    + (keyed.length ? (BILLING === 'api' ? ` (${keyed[0]} passed through)` : ` (${keyed.join(', ')} withheld from turns)`) : ''));
  console.log('     Ctrl-C to stop.\n');
  if (OPEN) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try { spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref(); }
    catch { /* the URL is printed above — opening is a convenience, not a requirement */ }
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is taken — another chat runtime is probably already running.`);
    console.error(`  Use a different one:  node scripts/kb-chat.mjs --port ${PORT + 1}\n`);
    process.exit(1);
  }
  throw err;
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const run of runs.values()) { try { run.proc.kill('SIGTERM'); } catch { /* ignore */ } }
    process.exit(0);
  });
}
