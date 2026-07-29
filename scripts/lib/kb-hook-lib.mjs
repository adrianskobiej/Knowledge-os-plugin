// Shared helpers for the Claude-only capture hooks (kb-capture-nudge, kb-session-capture).
// Zero dependencies; every function is total — it returns an empty/neutral value rather than
// throwing, because a hook that throws is a hook that breaks someone's session.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE || '';
const MAX_TRANSCRIPT_BYTES = 24 * 1024 * 1024; // beyond this, parsing costs more than the nudge is worth
const NUDGE_STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Parse the hook payload Claude Code writes to stdin. `{}` when there is nothing to read. */
export function readHookInput() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
}

/** Nearest ancestor of `from` that is a knowledge base, or '' when the session runs outside one. */
export function baseAbove(from) {
  let dir = from || '';
  while (dir) {
    if (existsSync(join(dir, 'knowledge.config.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return '';
    dir = parent;
  }
  return '';
}

/**
 * Every base this machine knows about: the one containing `cwd` (if any) first, then the ones
 * install.mjs registered. Sessions run mostly in PROJECTS, so the registry is the common path —
 * without it a capture hook would only ever fire while working inside the base itself.
 */
export function findBases(cwd) {
  const out = [];
  const here = baseAbove(cwd);
  if (here) out.push(here);
  try {
    const reg = JSON.parse(readFileSync(join(HOME, '.config', 'knowledge-os', 'bases.json'), 'utf8'));
    for (const b of reg.bases || []) {
      if (typeof b === 'string' && !out.includes(b) && existsSync(join(b, 'knowledge.config.json'))) out.push(b);
    }
  } catch { /* no registry yet — the cwd base (if any) still counts */ }
  return out;
}

/** `knowledge.config.json` for a base, or `{}`. */
export function readConfig(base) {
  try { return JSON.parse(readFileSync(join(base, 'knowledge.config.json'), 'utf8')); } catch { return {}; }
}

/** The transcript as parsed JSONL rows; unparseable rows are dropped, not fatal. */
export function readTranscript(path) {
  if (!path || !existsSync(path)) return [];
  try { if (statSync(path).size > MAX_TRANSCRIPT_BYTES) return []; } catch { return []; }
  let raw = '';
  try { raw = readFileSync(path, 'utf8'); } catch { return []; }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* partial write mid-append — skip */ }
  }
  return rows;
}

const blocks = (row) => {
  const c = row && row.message && row.message.content;
  return Array.isArray(c) ? c : [];
};

/**
 * Real user prompts, in order. Tool results arrive as `type: "user"` rows too, so a row only
 * counts when it carries no `tool_result` block — otherwise every tool call would inflate the
 * turn count and the nudge would fire on a session the user has barely spoken in.
 */
export function userPrompts(rows) {
  const out = [];
  for (const row of rows) {
    if (!row || row.type !== 'user') continue;
    const c = row.message && row.message.content;
    if (typeof c === 'string') { if (c.trim()) out.push(c); continue; }
    if (!Array.isArray(c)) continue;
    if (c.some((b) => b && b.type === 'tool_result')) continue;
    const text = c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n').trim();
    if (text) out.push(text);
  }
  return out;
}

/** Absolute paths passed to Write/Edit/NotebookEdit during the session, de-duplicated, in order. */
export function filesWritten(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row || row.type !== 'assistant') continue;
    for (const b of blocks(row)) {
      if (!b || b.type !== 'tool_use') continue;
      if (!/^(Write|Edit|NotebookEdit)$/.test(b.name || '')) continue;
      const p = b.input && b.input.file_path;
      if (typeof p === 'string' && p) seen.add(p);
    }
  }
  return [...seen];
}

/** True when the session already wrote into one of the bases — the signal that capture happened. */
export function wroteToBase(files, bases) {
  return files.some((f) => bases.some((b) => f === b || f.startsWith(b.endsWith(sep) ? b : b + sep)));
}

// ── Nudge bookkeeping ────────────────────────────────────────────────────────
// The reminder must repeat on a cadence without repeating every turn, and "have I already
// nudged?" cannot be read off the transcript. It is one small file per session: cheap to write,
// pruned on every write, and its loss only costs one extra reminder. Deriving the cadence from
// the turn count alone (fire when `turns % N === 0`) looks stateless but silently does nothing
// for a whole session as soon as the count steps over the trigger value.

const nudgeDir = () => join(HOME, '.config', 'knowledge-os', 'nudge');
const nudgeFile = (key) => join(nudgeDir(), `${String(key).replace(/[^\w-]/g, '_').slice(-64)}.json`);

/** Turn count at the last nudge for this session; `-Infinity` when it has never fired. */
export function lastNudgeTurn(key) {
  try {
    const n = JSON.parse(readFileSync(nudgeFile(key), 'utf8')).turn;
    return Number.isFinite(n) ? n : -Infinity;
  } catch { return -Infinity; }
}

/** Record a nudge, and drop bookkeeping for sessions that ended over a week ago. */
export function recordNudge(key, turn) {
  try {
    mkdirSync(nudgeDir(), { recursive: true });
    writeFileSync(nudgeFile(key), JSON.stringify({ turn }));
    const cutoff = Date.now() - NUDGE_STATE_TTL_MS;
    for (const f of readdirSync(nudgeDir())) {
      const p = join(nudgeDir(), f);
      try { if (statSync(p).mtimeMs < cutoff) rmSync(p); } catch { /* raced with another session */ }
    }
  } catch { /* bookkeeping is best-effort — a lost write costs one extra reminder */ }
}

/** Spool directory for undistilled session notes. Skipped by reindex (leading `_`). */
export const pendingDir = (base) => join(base, '_pending');

/** Spool files awaiting distillation, newest first. */
export function pendingNotes(base) {
  const dir = pendingDir(base);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
  } catch { return []; }
}
