#!/usr/bin/env node
// SessionEnd hook — layer 3 of the capture loop (the safety net).
//
// Layers 1 and 2 ask the model to save what it learned. This layer assumes it didn't. When a
// substantive session ends without a single write into a knowledge base, the raw material is
// spooled to `<base>/_pending/` so the next session can distil it instead of it being lost with
// the context window.
//
// Two rules keep the spool honest:
//   * Nothing is spooled when the session DID write to a base — otherwise every captured session
//     would also leave a duplicate for someone to re-capture later.
//   * Nothing is spooled for a short session; a couple of turns is a question, not a body of work.
//
// A spool file is undistilled raw material, not knowledge: `_pending/` is skipped by reindex
// (leading underscore) and git-ignored, so it never reaches the index, the viewer, or a teammate's
// clone. The first prompt of the next session surfaces the backlog (see kb-capture-nudge).

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { readHookInput, findBases, readTranscript, userPrompts, filesWritten, wroteToBase, pendingDir } from './lib/kb-hook-lib.mjs';

const MIN_TURNS = 4;      // below this a session is a question, not work worth spooling
const MAX_PROMPTS = 40;   // cap the spool: the shape of the session, not a transcript copy
const MAX_FILES = 30;
const MAX_PROMPT_CHARS = 400;

const clip = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + ' …' : s);

try {
  const input = readHookInput();
  const cwd = input.cwd || process.cwd();
  const bases = findBases(cwd);
  if (!bases.length) process.exit(0);

  const rows = readTranscript(input.transcript_path);
  const prompts = userPrompts(rows);
  if (prompts.length < MIN_TURNS) process.exit(0);

  const files = filesWritten(rows);
  if (wroteToBase(files, bases)) process.exit(0); // already captured — do not leave a duplicate

  const base = bases[0];
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const sid = String(input.session_id || 'unknown').replace(/[^\w-]/g, '').slice(0, 8) || 'unknown';
  const project = basename(cwd) || 'unknown';

  const outside = files.filter((f) => !bases.some((b) => f.startsWith(b.endsWith(sep) ? b : b + sep)));
  const body = [
    '---',
    'kind: pending-capture',
    `session: ${sid}`,
    `date: ${date}`,
    `project: ${project}`,
    `cwd: ${cwd}`,
    '---',
    '',
    `# Uncaptured session — ${project}, ${date}`,
    '',
    'This session ran to the end without writing anything to the base. Raw material below —',
    'distil what is durable into an article (or delete this file if there is nothing).',
    '',
    `## What was asked (${prompts.length} turn(s))`,
    '',
    ...prompts.slice(0, MAX_PROMPTS).map((p) => `- ${clip(p.replace(/\s+/g, ' ').trim(), MAX_PROMPT_CHARS)}`),
    ...(prompts.length > MAX_PROMPTS ? ['', `_… and ${prompts.length - MAX_PROMPTS} more turn(s)._`] : []),
    '',
    '## Files changed',
    '',
    ...(outside.length
      ? outside.slice(0, MAX_FILES).map((f) => `- \`${f}\``)
      : ['- _none_']),
    ...(outside.length > MAX_FILES ? [`- _… and ${outside.length - MAX_FILES} more._`] : []),
    '',
  ].join('\n');

  const dir = pendingDir(base);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${date}-${sid}.md`), body);
} catch { /* a failed spool must never surface as a session error */ }
process.exit(0);
