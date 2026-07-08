#!/usr/bin/env node
// kb-guard.mjs — content safety guard for ingest. High-signal secret patterns
// (the same shapes as CI's check-secrets.mjs) so real keys/tokens can never be
// pulled into the base from a URL, paste or file. Zero dependencies.
//
// Import:  import { scanSecrets } from './kb-guard.mjs'
// CLI:     node scripts/kb-guard.mjs <file>     (exit 1 + list if anything matches)

import { readFileSync } from 'node:fs';

// Real key/token shapes only — prose that merely says "secret"/"token" won't trip.
export const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub personal access token'],
  [/gho_[A-Za-z0-9]{30,}/, 'GitHub OAuth token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub fine-grained PAT'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/, 'private key'],
  [/sk-[A-Za-z0-9]{20,}/, 'API secret key (sk-…)'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/AIza[0-9A-Za-z\-_]{35}/, 'Google API key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT / signed token'],
];

// Returns [{ line, label }] for every high-signal match (empty = clean).
export function scanSecrets(text) {
  const hits = [];
  String(text).split('\n').forEach((line, i) => {
    for (const [re, label] of SECRET_PATTERNS) if (re.test(line)) hits.push({ line: i + 1, label });
  });
  return hits;
}

// CLI mode — only when run directly, not when imported.
if (process.argv[1] && process.argv[1].endsWith('kb-guard.mjs')) {
  const f = process.argv[2];
  if (!f) { console.error('Usage: kb-guard.mjs <file>'); process.exit(2); }
  let text = '';
  try { text = readFileSync(f, 'utf8'); } catch { console.error(`✗ cannot read ${f}`); process.exit(2); }
  const hits = scanSecrets(text);
  if (hits.length) {
    console.error(`✗ ${hits.length} secret-like hit(s) in ${f}:`);
    hits.forEach(h => console.error(`  L${h.line} — ${h.label}`));
    process.exit(1);
  }
  console.log(`✓ no secrets detected in ${f}`);
}
