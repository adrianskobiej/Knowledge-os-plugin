#!/usr/bin/env node
// UserPromptSubmit hook — layer 2 of the capture loop (in-session).
//
// The global instruction file states the capture rule once, at session start. In a long session
// that line is thousands of tokens back, and the model that was going to save something at the
// natural stopping point never reaches one. This hook re-states the rule mid-session — but only
// when it is actually warranted:
//
//   * the session has run long enough to have produced something durable, AND
//   * nothing has been written into a knowledge base yet.
//
// A session that is already capturing gets no reminder at all. Neither does a short one. The
// reminder then repeats on a fixed cadence rather than every turn, so a session that keeps
// declining to save is nudged a handful of times, not fifty.
//
// Also fires once, on the first prompt, to name the base's orchestrator when one is configured
// (`"orchestrator": "<agent>"` in knowledge.config.json) — the closest thing to a default agent,
// since Claude Code has no such setting for the main loop.
//
// stdout + exit 0 = added to the model's context. Never blocks a prompt.

import { readHookInput, findBases, readConfig, readTranscript, userPrompts, filesWritten, wroteToBase, pendingNotes, lastNudgeTurn, recordNudge } from './lib/kb-hook-lib.mjs';

const FIRST_NUDGE_AT = 10; // user turns before the first reminder
const NUDGE_EVERY = 15;    // minimum turns between reminders afterwards

try {
  const input = readHookInput();
  const bases = findBases(input.cwd || process.cwd());
  if (!bases.length) process.exit(0);

  const rows = readTranscript(input.transcript_path);
  // The just-submitted prompt is not in the transcript yet, so this is the count BEFORE it.
  const turns = userPrompts(rows).length;

  const out = [];

  if (turns === 0) {
    const orchestrator = String(readConfig(bases[0]).orchestrator || '').trim();
    if (orchestrator) {
      out.push(`[knowledge-os] This base's default orchestrator is \`${orchestrator}\`. For work — deliverables, file changes, anything multi-step — route through it (Agent tool, exactly that short name) instead of doing it inline, unless the user names another agent or is just asking a question.`);
    }
    const pending = pendingNotes(bases[0]).length;
    if (pending) {
      out.push(`[knowledge-os] ${pending} session note(s) in \`_pending/\` were spooled but never distilled into the base. Mention this once and offer to work through them.`);
    }
  } else if (turns >= FIRST_NUDGE_AT) {
    const key = input.session_id || input.transcript_path || 'unknown';
    if (turns - lastNudgeTurn(key) >= NUDGE_EVERY && !wroteToBase(filesWritten(rows), bases)) {
      recordNudge(key, turns);
      out.push(`[knowledge-os] ${turns} turns in and nothing has been saved to the knowledge base this session. If anything durable has come up — a decision and why, a fact about a client or project, a correction of something the base has wrong — capture it now, while the context is still here: refine the relevant article in place, or add a short new one. If nothing durable has come up, ignore this and do not mention it.`);
    }
  }

  if (out.length) console.log(out.join('\n'));
} catch { /* never block the prompt */ }
process.exit(0);
