#!/usr/bin/env node
// kb-graph.mjs — query the base as a graph. Reads graph.json (structure: nodes,
// edges, communities, god nodes) + kb-data.js (directional links/backlinks, if present).
// Zero dependencies. All traversal is done here, deterministically — never left to the LLM.
//
// Usage (run from the knowledge base root):
//   node scripts/kb-graph.mjs explain <slug|text>   # a node, its neighbours, its community
//   node scripts/kb-graph.mjs path <a> <b>          # shortest [[link]] chain between two concepts
//   node scripts/kb-graph.mjs links <slug|text>     # what links here / what this links to (impact)
//   node scripts/kb-graph.mjs god                   # the most-connected concepts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const [, , cmd, ...rest] = process.argv;

let graph;
try { graph = JSON.parse(readFileSync(join(ROOT, 'graph.json'), 'utf8')); }
catch { console.error('✗ graph.json not found — run `node scripts/reindex.mjs` first.'); process.exit(1); }

// Directional links/backlinks come from kb-data.js when available (graph.json edges
// are undirected). Best-effort: fall back to the undirected graph if kb-data is absent.
const bySlug = {};
try {
  const raw = readFileSync(join(ROOT, 'kb-data.js'), 'utf8').replace(/^window\.KB_DATA\s*=\s*/, '').replace(/;\s*$/, '');
  for (const a of JSON.parse(raw).articles) bySlug[a.slug] = a;
} catch { /* optional */ }

const nodes = new Map(graph.nodes.map(n => [n.id, n]));
const adj = new Map(graph.nodes.map(n => [n.id, new Set()]));
for (const e of graph.edges) { adj.get(e.source)?.add(e.target); adj.get(e.target)?.add(e.source); }
const commLabel = new Map((graph.communities || []).map(c => [c.id, c.label]));

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const label = id => (nodes.get(id)?.label || id);
const line = id => { const n = nodes.get(id); return `${n?.label || id}  ·  ${n?.path || ''}`; };

// Resolve a slug or free text to a node id (exact slug → exact label → substring).
function resolve(q) {
  if (nodes.has(q)) return q;
  const nq = norm(q);
  const exact = graph.nodes.find(n => norm(n.label) === nq || norm(n.id) === nq);
  if (exact) return exact.id;
  const cand = graph.nodes.filter(n => norm(n.label).includes(nq) || norm(n.id).includes(nq));
  if (cand.length === 0) return null;
  if (cand.length > 1) console.error(`~ "${q}" is ambiguous → picking closest; candidates: ${cand.slice(0, 6).map(n => n.id).join(', ')}`);
  return cand.sort((a, b) => (b.degree || 0) - (a.degree || 0))[0].id;
}

function bfs(a, b) {
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const s = queue.shift();
    if (s === b) break;
    for (const n of [...(adj.get(s) || [])].sort()) if (!prev.has(n)) { prev.set(n, s); queue.push(n); }
  }
  if (!prev.has(b)) return null;
  const path = []; let c = b;
  while (c !== null) { path.unshift(c); c = prev.get(c); }
  return path;
}

if (cmd === 'god') {
  console.log('🧭 God nodes (most connected):');
  for (const [i, id] of (graph.godNodes || []).entries())
    console.log(`  ${i + 1}. ${line(id)}  (${nodes.get(id)?.degree || 0} links)`);
  process.exit(0);
}

if (cmd === 'explain') {
  const id = resolve(rest.join(' '));
  if (!id) { console.error(`✗ No node matches "${rest.join(' ')}".`); process.exit(1); }
  const n = nodes.get(id);
  const isGod = (graph.godNodes || []).includes(id);
  console.log(`# ${n.label}${isGod ? '  🧭 (god node)' : ''}`);
  console.log(`path: ${n.path}  ·  zone: ${n.zone}  ·  degree: ${n.degree}  ·  community: ${n.community >= 0 ? `#${n.community} ${commLabel.get(n.community) || ''}` : '—'}`);
  const nbrs = [...(adj.get(id) || [])].sort((a, b) => (nodes.get(b)?.degree || 0) - (nodes.get(a)?.degree || 0));
  console.log(`\nConnected (${nbrs.length}):`);
  for (const m of nbrs) console.log(`  • ${line(m)}`);
  if (n.community >= 0) {
    const peers = graph.nodes.filter(x => x.community === n.community && x.id !== id).map(x => x.id);
    if (peers.length) console.log(`\nSame community (#${n.community} ${commLabel.get(n.community) || ''}): ${peers.map(label).join(', ')}`);
  }
  process.exit(0);
}

if (cmd === 'links') {
  const id = resolve(rest.join(' '));
  if (!id) { console.error(`✗ No node matches "${rest.join(' ')}".`); process.exit(1); }
  console.log(`# Impact of "${label(id)}"  ·  ${nodes.get(id)?.path || ''}`);
  const a = bySlug[id];
  if (a) {
    console.log(`\n← Referenced by (${a.backlinks.length}) — these break/need review if it changes:`);
    for (const s of a.backlinks) console.log(`  • ${line(s)}`);
    console.log(`\n→ Links out to (${a.links.length}):`);
    for (const s of a.links) console.log(`  • ${nodes.has(s) ? line(s) : s + '  (⚠ dead link)'}`);
  } else {
    const nbrs = [...(adj.get(id) || [])];
    console.log(`\nConnected (${nbrs.length}) — direction unavailable (no kb-data.js):`);
    for (const m of nbrs) console.log(`  • ${line(m)}`);
  }
  process.exit(0);
}

if (cmd === 'path') {
  const [qa, qb] = [resolve(rest[0]), resolve(rest.slice(1).join(' ') || '')];
  if (!qa || !qb) { console.error('✗ Usage: kb-graph.mjs path <a> <b> — one or both endpoints not found.'); process.exit(1); }
  const p = bfs(qa, qb);
  if (!p) { console.log(`No [[link]] path between "${label(qa)}" and "${label(qb)}" — they're in disconnected parts of the base.`); process.exit(0); }
  console.log(`Shortest path (${p.length - 1} hop${p.length - 1 === 1 ? '' : 's'}):\n`);
  console.log(p.map(label).join('\n  ↓ links to\n'));
  process.exit(0);
}

console.error('Usage: kb-graph.mjs <explain|path|links|god> [args]  (run from the base root)');
process.exit(1);
