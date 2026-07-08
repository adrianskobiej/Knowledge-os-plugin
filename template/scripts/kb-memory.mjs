#!/usr/bin/env node
// kb-memory.mjs — the base's work memory. Records how Q&A / tasks turned out and
// distils them into LESSONS.md so the next session starts smarter. Zero dependencies.
//
// Usage (run from the knowledge base root):
//   save    node scripts/kb-memory.mjs save --question "Q" --answer "A" \
//                 --outcome useful|dead_end|corrected --nodes slug1 slug2 [--correction "..."] [--author name]
//   reflect node scripts/kb-memory.mjs reflect [--half-life 30] [--min-corroboration 2] [--out LESSONS.md]
//   log     node scripts/kb-memory.mjs log --question "Q" [--nodes slug1 slug2]   (append-only query log)
//
// Scoring is deterministic: each citation contributes a signed, time-decayed value
// (useful +, dead_end/corrected −), so a fresh dead end outweighs a stale success.
// A node is only "preferred" once corroborated by ≥N distinct useful results.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const MEM = join(ROOT, 'memory');
const OUTCOMES = { useful: 1, dead_end: -1, corrected: -1 };

// ── arg parsing: --key "val" (string) · --nodes a b c (array) · --flag (true) ──
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length;) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2); const vals = []; i++;
      while (i < argv.length && !argv[i].startsWith('--')) { vals.push(argv[i]); i++; }
      out[key] = vals.length === 0 ? true : vals.length === 1 ? vals[0] : vals;
    } else { out._.push(a); i++; }
  }
  return out;
}
const [cmd, ...restArgv] = process.argv.slice(2);
const args = parseArgs(restArgv);
const asList = v => v == null ? [] : Array.isArray(v) ? v : [v];
const yamlStr = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
const today = () => new Date().toISOString().slice(0, 10);

// ── SAVE — write one memory doc ───────────────────────────────────────────────
if (cmd === 'save') {
  const outcome = String(args.outcome || '').toLowerCase();
  if (!OUTCOMES[outcome]) { console.error(`✗ --outcome must be one of: ${Object.keys(OUTCOMES).join(', ')}`); process.exit(1); }
  if (!args.question) { console.error('✗ --question is required.'); process.exit(1); }
  mkdirSync(MEM, { recursive: true });
  const nodes = asList(args.nodes);
  const date = args.date || today();
  const id = createHash('sha256').update(`${date}|${args.question}|${Date.now()}`).digest('hex').slice(0, 8);
  let fm = `---\n`;
  fm += `question: ${yamlStr(args.question)}\n`;
  if (args.answer) fm += `answer: ${yamlStr(args.answer)}\n`;
  fm += `outcome: ${yamlStr(outcome)}\n`;
  fm += `nodes: [${nodes.map(yamlStr).join(', ')}]\n`;
  if (args.correction) fm += `correction: ${yamlStr(args.correction)}\n`;
  fm += `date: ${yamlStr(date)}\n`;
  fm += `author: ${yamlStr(args.author || '')}\n`;
  fm += `---\n`;
  const path = join(MEM, `${date}-${id}.md`);
  writeFileSync(path, fm);
  console.log(`✓ Saved memory → memory/${date}-${id}.md  (${outcome}${nodes.length ? `, nodes: ${nodes.join(', ')}` : ''})`);
  console.log(`  Run \`node scripts/kb-memory.mjs reflect\` to fold it into LESSONS.md.`);
  process.exit(0);
}

// ── LOG — append-only query log (T14) ─────────────────────────────────────────
if (cmd === 'log') {
  if (!args.question) { console.error('✗ --question is required.'); process.exit(1); }
  mkdirSync(MEM, { recursive: true });
  try {
    appendFileSync(join(MEM, 'querylog.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), question: String(args.question), nodes: asList(args.nodes) }) + '\n');
  } catch { /* fail-silent */ }
  process.exit(0);
}

// ── REFLECT — aggregate memory docs → LESSONS.md ──────────────────────────────
if (cmd === 'reflect') {
  const halfLife = Number(args['half-life']) || 30;
  const minCorr = Number(args['min-corroboration']) || 2;
  const outFile = args.out || 'LESSONS.md';
  const nowMs = args.now ? Date.parse(args.now) : Date.now();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // node titles/paths + community labels, if the graph is present
  const titleOf = {}; const pathOf = {}; const commOf = {}; const commLabel = {};
  try {
    const g = JSON.parse(readFileSync(join(ROOT, 'graph.json'), 'utf8'));
    for (const n of g.nodes) { titleOf[n.id] = n.label; pathOf[n.id] = n.path; commOf[n.id] = n.community; }
    for (const c of g.communities || []) commLabel[c.id] = c.label;
  } catch { /* optional */ }
  const label = s => titleOf[s] || s;
  const commTag = s => (commOf[s] >= 0 ? ` _(#${commOf[s]} ${commLabel[commOf[s]] || ''})_` : '');
  const linkOf = s => pathOf[s] ? `[${label(s)}](${pathOf[s]})` : `\`${s}\``;

  // parse memory docs
  const parseDoc = (text) => {
    if (!text.startsWith('---')) return null;
    const end = text.indexOf('\n---', 3); if (end === -1) return null;
    const doc = {};
    for (const line of text.slice(3, end).trim().split('\n')) {
      const mL = line.match(/^nodes:\s*\[(.*)\]\s*$/);
      if (mL) { doc.nodes = mL[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean); continue; }
      const mS = line.match(/^([a-z_]+):\s*"(.*)"\s*$/i);
      if (mS) doc[mS[1]] = mS[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return doc.question ? doc : null;
  };
  const docs = [];
  if (existsSync(MEM)) for (const f of readdirSync(MEM)) {
    if (!f.endsWith('.md')) continue;
    const d = parseDoc(readFileSync(join(MEM, f), 'utf8'));
    if (d && OUTCOMES[d.outcome]) docs.push(d);
  }
  docs.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const nodeAgg = new Map();  // slug → { score, useful, neg, prov[] }
  const deadEnds = []; const corrections = [];
  for (const d of docs) {
    const ageDays = Math.max(0, (nowMs - Date.parse(d.date || today())) / 86400000);
    const w = Math.pow(0.5, ageDays / halfLife);
    const sign = OUTCOMES[d.outcome];
    for (const s of d.nodes || []) {
      if (!nodeAgg.has(s)) nodeAgg.set(s, { score: 0, useful: 0, neg: 0, prov: [] });
      const m = nodeAgg.get(s);
      m.score += sign * w;
      if (sign > 0) m.useful++; else m.neg++;
      m.prov.push({ q: d.question, date: d.date, outcome: d.outcome });
    }
    if (d.outcome === 'dead_end') deadEnds.push({ q: d.question, nodes: d.nodes || [] });
    if (d.outcome === 'corrected') corrections.push({ q: d.question, correction: d.correction || '' });
  }
  // drop nodes that no longer exist in the graph (when a graph is present)
  if (Object.keys(titleOf).length) for (const s of [...nodeAgg.keys()]) if (!(s in titleOf)) nodeAgg.delete(s);

  const round = n => Math.round(n * 1e6) / 1e6;
  const preferred = [], tentative = [], contested = [];
  for (const [s, m] of nodeAgg) {
    m.score = round(m.score);
    const rec = { s, ...m };
    if (m.useful > 0 && m.neg > 0) contested.push({ ...rec, verdict: m.score > 0 ? 'ufaj' : 'unikaj' });
    else if (m.useful >= minCorr && m.score > 0) preferred.push(rec);
    else if (m.score > 0) tentative.push(rec);
    // purely-negative nodes intentionally don't surface as sources
  }
  const bySlug = (x, y) => x.s.localeCompare(y.s);
  const byScore = (x, y) => y.score - x.score || bySlug(x, y);
  preferred.sort(byScore); tentative.sort(byScore); contested.sort(byScore);
  const lastUse = m => m.prov.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date || '?';

  let out = `# LESSONS — what the base has learned\n\n`;
  out += `> Generated by \`scripts/kb-memory.mjs reflect\`. Read at session start — this is work\n`;
  out += `> memory: which sources paid off, which were dead ends, what got corrected.\n\n`;
  out += `Signals: **${docs.length}** doc(s) · half-life **${halfLife}d** · corroboration **≥${minCorr}** · rebuilt ${stamp}\n`;
  out += `\n## ✅ Preferred sources (corroborated — reach for these first)\n\n`;
  out += preferred.length ? preferred.map(m => `- ${linkOf(m.s)}${commTag(m.s)} — useful ${m.useful}× · score ${m.score} · last ${lastUse(m)}`).join('\n') + '\n' : '_none yet_\n';
  out += `\n## 🌤 Tentative (useful once — not yet corroborated)\n\n`;
  out += tentative.length ? tentative.map(m => `- ${linkOf(m.s)}${commTag(m.s)} — score ${m.score} · last ${lastUse(m)}`).join('\n') + '\n' : '_none yet_\n';
  out += `\n## ⚠ Contested (mixed signals — recency decides)\n\n`;
  out += contested.length ? contested.map(m => `- ${linkOf(m.s)}${commTag(m.s)} — **${m.verdict}** (useful ${m.useful}×, negative ${m.neg}×, score ${m.score})`).join('\n') + '\n' : '_none_\n';
  out += `\n## ⛔ Known dead ends (don't re-derive these)\n\n`;
  out += deadEnds.length ? deadEnds.map(d => `- "${d.q}"${d.nodes.length ? ` — ${d.nodes.map(linkOf).join(', ')}` : ''}`).join('\n') + '\n' : '_none_\n';
  out += `\n## ✏️ Corrections (what the right answer was)\n\n`;
  out += corrections.length ? corrections.map(c => `- "${c.q}" → ${c.correction || '⚠ correction not recorded'}`).join('\n') + '\n' : '_none_\n';
  writeFileSync(join(ROOT, outFile), out);
  console.log(`✓ Wrote ${outFile} — ${preferred.length} preferred · ${tentative.length} tentative · ${contested.length} contested · ${deadEnds.length} dead end(s) · from ${docs.length} memory doc(s)`);
  process.exit(0);
}

console.error('Usage: kb-memory.mjs <save|reflect|log> [args]  (run from the base root)');
process.exit(1);
