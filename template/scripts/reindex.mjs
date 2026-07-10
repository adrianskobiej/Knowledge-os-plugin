#!/usr/bin/env node
// reindex.mjs — rebuilds INDEX.md (lightweight, for LLMs) + kb-data.js (for viewer.html)
// from the frontmatter in .md articles. Zero dependencies — needs only `node`.
//
// Also emits the graph layer (the base is a link graph — [[wikilinks]] are edges):
//   • INSIGHTS.md — god nodes, surprising cross-zone links, communities, suggested questions
//   • graph.json  — portable node/edge graph (degree + community per node) for tools & queries
//
// Usage:  node scripts/reindex.mjs           (run from the knowledge base root)
//         node scripts/reindex.mjs --lint     (consistency report only, no writes)
//         node scripts/reindex.mjs --bless-quotes  (approve the current protected-quotes state)

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, relative, sep, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const CONTENT_DIRS = ['departments', 'projects', 'people', 'concepts', 'skills', 'meetings', 'tasks', 'journal'];
// OKF (Open Knowledge Format) requires a `type` on every concept. We honor an explicit
// `type:` in frontmatter and otherwise derive a sensible default from the zone, so every
// article is OKF-conformant without per-file edits.
const ZONE_TYPE = { projects: 'Project', skills: 'Skill', people: 'Person', meetings: 'Meeting', concepts: 'Concept', departments: 'Department', tasks: 'Task', journal: 'Journal' };
// Task workflow states (tasks/ zone). `done` tasks leave the board's active columns;
// `status: archived` (shared lifecycle) removes a task from indexes entirely.
const TASK_STATES = ['todo', 'doing', 'blocked', 'done'];
const LINT_ONLY = process.argv.includes('--lint');
const BLESS = process.argv.includes('--bless-quotes');
const INSTALL_HOOK = process.argv.includes('--install-git-hook');
const STATS = process.argv.includes('--stats');
const REQUIRED = ['title', 'slug', 'category', 'summary', 'status'];
const AUTHORITIES = ['primary', 'secondary', 'derived'];
const CONFIDENCES = ['verified', 'inferred', 'unverified'];  // T21: human-verified vs AI-inferred (≈ Graphify EXTRACTED/INFERRED)
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// ── Universal auto-reindex (tool-agnostic: Claude / Codex / Antigravity) ──────
// Claude has its own PostToolUse hook; other tools don't. Git hooks work everywhere:
// reindex on commit / pull / checkout. We never overwrite someone else's hooks.
if (INSTALL_HOOK) {
  const gitDir = join(ROOT, '.git');
  if (!existsSync(gitDir)) { console.error('✗ Not a git repo (no .git) — run inside a base directory.'); process.exit(1); }
  const hooksDir = join(gitDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const body = `#!/bin/sh\n# knowledge-os auto-reindex\nnode "scripts/reindex.mjs" >/dev/null 2>&1 || true\n`;
  for (const h of ['pre-commit', 'post-merge', 'post-checkout']) {
    const p = join(hooksDir, h);
    if (existsSync(p) && !readFileSync(p, 'utf8').includes('knowledge-os auto-reindex')) {
      console.log(`· Skipped ${h}: another hook already exists. Add manually: node scripts/reindex.mjs`); continue;
    }
    writeFileSync(p, body); chmodSync(p, 0o755);
    console.log(`✓ ${h}`);
  }
  console.log('✓ Git hooks installed → auto-reindex on commit / pull / checkout');
  process.exit(0);
}

// ── Collecting files ────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (extname(e.name) === '.md' && e.name !== 'INDEX.md') acc.push(full);
  }
  return acc;
}

// ── Frontmatter ─────────────────────────────────────────────────────────────
function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, '');
  const meta = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      meta[k] = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      meta[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body };
}

// Strips code (fenced + inline) so link extraction doesn't catch syntax examples.
const stripCode = s => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

// ── Markdown → HTML renderer (minimal, self-contained) ──────────────────────
// We also escape quotes — values land inside attributes (href), so without this
// it would be possible to break out of the attribute and inject a handler (XSS).
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Allows only safe URL schemes (http/https/mailto), anchors and relative paths.
// Rejects e.g. javascript:/data:/vbscript: → '#'. Input is already esc()'d.
const safeUrl = u => {
  const t = u.trim();
  const scheme = (t.match(/^([a-z][a-z0-9+.\-]*):/i) || [])[1];
  if (scheme && !/^(https?|mailto)$/i.test(scheme)) return '#';
  return t;
};

// Formats inline text. Inline code is isolated into segments (split),
// so formatting never leaks inside backticks.
function inline(text, slugs) {
  return text.split(/(`[^`]+`)/g).map(seg => {
    if (seg.length > 1 && seg.startsWith('`') && seg.endsWith('`'))
      return `<code>${esc(seg.slice(1, -1))}</code>`;
    let t = esc(seg);
    t = t.replace(WIKILINK, (_, slug, label) => {
      slug = slug.trim();
      const ok = slugs.has(slug);
      return `<a class="wikilink${ok ? '' : ' broken'}" href="#${slug}">${(label || slug).trim()}</a>`;
    });
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, x, u) => `<a href="${safeUrl(u)}">${x}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    return t;
  }).join('');
}

function mdToHtml(md, slugs) {
  const lines = md.split('\n');
  let html = '', i = 0, inCode = false, codeBuf = [], list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const SPECIAL = /^(#{1,6}\s|```|>|[-*]\s|\d+\.\s|---+\s*$|\s*\|)/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (!inCode) { closeList(); inCode = true; codeBuf = []; }
      else { inCode = false; html += `<pre><code>${esc(codeBuf.join('\n'))}</code></pre>`; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }
    let m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) { closeList(); const l = m[1].length; html += `<h${l}>${inline(m[2], slugs)}</h${l}>`; i++; continue; }
    if (/^---+\s*$/.test(line)) { closeList(); html += '<hr>'; i++; continue; }
    if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ''), slugs)}</blockquote>`; i++; continue; }
    // Tables: a "| a | b |" header followed by a "|---|---|" separator row.
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      let t = '<table><thead><tr>' + cells(line).map(c => `<th>${inline(c, slugs)}</th>`).join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        t += '<tr>' + cells(lines[i]).map(c => `<td>${inline(c, slugs)}</td>`).join('') + '</tr>'; i++;
      }
      html += t + '</tbody></table>'; continue;
    }
    m = line.match(/^[-*]\s+(.*)$/);
    if (m) { if (list !== 'ul') { closeList(); list = 'ul'; html += '<ul>'; } html += `<li>${inline(m[1], slugs)}</li>`; i++; continue; }
    m = line.match(/^\d+\.\s+(.*)$/);
    if (m) { if (list !== 'ol') { closeList(); list = 'ol'; html += '<ol>'; } html += `<li>${inline(m[1], slugs)}</li>`; i++; continue; }
    if (/^\s*$/.test(line)) { closeList(); i++; continue; }
    closeList();
    const para = [line]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !SPECIAL.test(lines[i])) { para.push(lines[i]); i++; }
    html += `<p>${inline(para.join(' '), slugs)}</p>`;
  }
  closeList();
  return html;
}

// ── Main pass ───────────────────────────────────────────────────────────────
const allFiles = CONTENT_DIRS.flatMap(d => walk(join(ROOT, d)));
const briefFiles = allFiles.filter(f => basename(f) === 'BRIEF.md');
const files = allFiles.filter(f => basename(f) !== 'BRIEF.md');
const articles = [];
const briefs = [];
const warnings = [];

// BRIEF.md — steering documents per folder (goal, audience, source hierarchy).
// They are not articles; the agent reads them before working in that folder.
for (const file of briefFiles) {
  const raw = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file).split(sep).join('/');
  const heading = (raw.match(/^#\s+(.*)$/m) || [])[1] || `Brief: ${dirname(rel)}`;
  briefs.push({ folder: dirname(rel), path: rel, title: heading.trim(), _body: raw });
}

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const parsed = parseFrontmatter(raw);
  if (!parsed) { warnings.push(`✗ Missing frontmatter: ${rel}`); continue; }
  const { meta, body } = parsed;
  const slug = meta.slug || basename(file, '.md');
  for (const f of REQUIRED) if (!meta[f]) warnings.push(`⚠ Missing field "${f}": ${rel}`);
  if (meta.authority && !AUTHORITIES.includes(meta.authority))
    warnings.push(`⚠ Unknown authority "${meta.authority}" (allowed: ${AUTHORITIES.join('/')}): ${rel}`);
  if (meta.confidence && !CONFIDENCES.includes(meta.confidence))
    warnings.push(`⚠ Unknown confidence "${meta.confidence}" (allowed: ${CONFIDENCES.join('/')}): ${rel}`);
  const wikilinks = [...stripCode(body).matchAll(WIKILINK)].map(m => m[1].trim());
  articles.push({
    slug,
    title: meta.title || slug,
    path: rel.split(sep).join('/'),
    category: meta.category || rel.split(sep)[0],
    type: meta.type || ZONE_TYPE[rel.split(sep)[0]] || 'Concept',  // OKF: required field (derived if absent)
    resource: meta.resource || '',                                   // OKF: optional canonical URI
    summary: meta.summary || '',
    tags: meta.tags || [],
    entities: meta.entities || [],
    aka: meta.aka || [],
    status: meta.status || 'draft',
    updated: meta.updated || '',
    source: meta.source || '',
    authority: meta.authority || '',
    confidence: meta.confidence || '',   // T21: verified | inferred | unverified (optional)
    author: meta.author || '',
    // Task fields (tasks/ zone; harmless empty elsewhere) — power BOARD.md + the viewer board.
    // assignee accepts one slug or a list ([anna, adrian]) — several people can own one task.
    assignees: Array.isArray(meta.assignee) ? meta.assignee : (meta.assignee ? [meta.assignee] : []),
    project: meta.project || '',
    due: meta.due || '',
    priority: meta.priority || '',
    recur: meta.recur || '',   // daily | weekly | monthly — recurring tasks (🔁 on the board)
    links: [...new Set(wikilinks)],
    _body: body,
  });
}

// Duplicate slugs (break linking — two files with the same slug)
const seen = {};
for (const a of articles) {
  if (seen[a.slug]) warnings.push(`⚠ Duplicate slug "${a.slug}": ${a.path} and ${seen[a.slug]}`);
  else seen[a.slug] = a.path;
}

// Too short / uninformative summary
for (const a of articles)
  if (a.summary && a.summary.trim().length < 15)
    warnings.push(`· Very short summary (refine it): ${a.path}`);

// Slug map + backlinks
const slugs = new Set(articles.map(a => a.slug));
const backlinks = Object.fromEntries(articles.map(a => [a.slug, []]));
for (const a of articles)
  for (const t of a.links) {
    if (!slugs.has(t)) warnings.push(`⚠ Dead link [[${t}]] in: ${a.path}`);
    else backlinks[t].push(a.slug);
  }

// Orphans (nobody links to it and it links to nobody)
for (const a of articles)
  if (backlinks[a.slug].length === 0 && a.links.length === 0)
    warnings.push(`· Orphan (no links): ${a.path}`);

// Stale content (knowledge rot): `updated` older than 6 months
const STALE_DAYS = 180;
const _now = Date.now();
for (const a of articles) {
  const t = Date.parse(a.updated);
  if (!Number.isNaN(t) && (_now - t) / 86400000 > STALE_DAYS)
    warnings.push(`· Stale (updated ${a.updated}, > 6 months — review): ${a.path}`);
}

// Config sanity — surface problems instead of silently swallowing them
let config = {};
try { config = JSON.parse(readFileSync(join(ROOT, 'knowledge.config.json'), 'utf8')); }
catch { warnings.push('⚠ knowledge.config.json: missing or invalid JSON'); }
if (config.departments && !Array.isArray(config.departments))
  warnings.push('⚠ knowledge.config.json: "departments" must be an array');
if (config.roster && (typeof config.roster !== 'object' || Array.isArray(config.roster)))
  warnings.push('⚠ knowledge.config.json: "roster" must be an object (email → slug)');

// ── Quote protection (enforced by code, not just by prompt) ──────────────────
// quotes.json: [{ id, text, in? }]. Lock (.quotes.lock.json) = approved state.
// Without --bless-quotes: warns when protected text changed since approval
// or when it does not appear verbatim in the file referenced by "in".
const norm = s => s.replace(/\s+/g, ' ').trim();
const hash = s => createHash('sha256').update(norm(s)).digest('hex').slice(0, 12);
const quotesPath = join(ROOT, 'quotes.json');
const lockPath = join(ROOT, '.quotes.lock.json');
if (existsSync(quotesPath)) {
  let quotes = [];
  try { quotes = (JSON.parse(readFileSync(quotesPath, 'utf8')).quotes) || []; }
  catch { warnings.push('⚠ quotes.json: invalid JSON'); }
  let lock = {};
  if (existsSync(lockPath)) { try { lock = JSON.parse(readFileSync(lockPath, 'utf8')); } catch {} }
  const fresh = {};
  for (const q of quotes) {
    if (!q.id || !q.text) { warnings.push('⚠ quotes.json: entry without id/text'); continue; }
    const h = hash(q.text);
    fresh[q.id] = h;
    if (lock[q.id] && lock[q.id] !== h)
      warnings.push(`🔒 Protected quote CHANGED since last --bless-quotes: "${q.id}"`);
    else if (!lock[q.id])
      warnings.push(`🔒 New protected quote (approve with: --bless-quotes): "${q.id}"`);
    if (q.in) {
      const f = join(ROOT, q.in);
      if (!existsSync(f)) warnings.push(`🔒 Quote "${q.id}": missing file ${q.in}`);
      else if (!norm(readFileSync(f, 'utf8')).includes(norm(q.text)))
        warnings.push(`🔒 Quote "${q.id}" does not appear VERBATIM in ${q.in} (paraphrase?)`);
    }
  }
  if (BLESS && !LINT_ONLY) {
    writeFileSync(lockPath, JSON.stringify(fresh, null, 2));
    console.log(`🔒 Approved ${Object.keys(fresh).length} protected quotes → .quotes.lock.json`);
  }
}

// ── Report / lint ───────────────────────────────────────────────────────────
const drafts = articles.filter(a => a.status === 'draft').length;
console.log(`\n📚 Articles: ${articles.length}${drafts ? ` (drafts: ${drafts})` : ''}`);
if (warnings.length) { console.log(`\n— Health-check (${warnings.length}):`); warnings.forEach(w => console.log('  ' + w)); }
else console.log('✓ Health-check clean');
if (LINT_ONLY) { console.log('\n(--lint: nothing written)\n'); process.exit(0); }

// ── Stats (base health at a glance) ─────────────────────────────────────────
if (STATS) {
  const bySec = {};
  for (const a of articles) (bySec[a.path.split('/')[0]] ??= []).push(a);
  const byAuthor = {};
  for (const a of articles) { const k = a.author || '(unattributed)'; byAuthor[k] = (byAuthor[k] || 0) + 1; }
  const orphans = articles.filter(a => backlinks[a.slug].length === 0 && a.links.length === 0).length;
  const stale = warnings.filter(w => w.startsWith('· Stale')).length;
  console.log('\n— Stats —');
  console.log('By section:'); for (const s of Object.keys(bySec).sort()) console.log(`  ${s}: ${bySec[s].length}`);
  console.log('By author:'); for (const a of Object.keys(byAuthor).sort()) console.log(`  ${a}: ${byAuthor[a]}`);
  console.log(`Totals: ${articles.length} articles · ${drafts} drafts · ${orphans} orphans · ${stale} stale (>6mo)`);
  console.log('\n(--stats: nothing written)\n');
  process.exit(0);
}

// ── INDEX.md (lightweight, for LLMs) — hierarchical: root map + per-zone indexes ──
// Lifecycle (P4): archived articles stay on disk + in the viewer, but drop out of the index
// listings so they don't clutter retrieval (still findable via grep).
const active = articles.filter(a => a.status !== 'archived');
const archived = articles.filter(a => a.status === 'archived');

// ── Knowledge graph: degree · communities · god nodes · surprising links ──────
// The base is already a graph ([[wikilinks]] = edges). Here we make that structure
// explicit and queryable — node degree, communities (label propagation, zero-dep),
// the most-connected "god nodes", and cross-zone "surprising" links the folder view
// hides. Feeds INSIGHTS.md, graph.json and (via kb-data.js) the viewer Map view.
// Fully deterministic: stable node order + string tie-breaks → byte-stable output.
const bySlug = Object.fromEntries(active.map(a => [a.slug, a]));
const zoneOf = a => a.path.split('/')[0];
const activeSlugSet = new Set(active.map(a => a.slug));
const adj = new Map(active.map(a => [a.slug, new Set()]));   // undirected neighbours
const edgeSet = new Set();                                    // "a|b" (a<b) — undirected dedupe
for (const a of active) {
  for (const t of a.links) {
    if (!activeSlugSet.has(t) || t === a.slug) continue;
    adj.get(a.slug).add(t); adj.get(t).add(a.slug);
    edgeSet.add(a.slug < t ? `${a.slug}|${t}` : `${t}|${a.slug}`);
  }
}
const edgeList = [...edgeSet].map(k => { const [source, target] = k.split('|'); return { source, target, relation: 'links_to' }; });
const degreeOf = s => (adj.get(s)?.size || 0);

// Community detection — label propagation on the hub-excluded subgraph. A few
// mega-hubs (e.g. the owner's profile) link to everything and, left in, collapse
// the whole base into one blob. So we lift out the highest-degree hubs, cluster the
// rest, then attach each hub to whichever cluster it connects to most. Deterministic:
// fixed node order + string tie-breaks → the same partition every run.
const _deg = active.map(a => degreeOf(a.slug)).sort((x, y) => x - y);
const HUB_CUT = Math.max(5, _deg[Math.floor(_deg.length * 0.9)] || Infinity);
const isHub = s => degreeOf(s) >= HUB_CUT;
const partNodes = active.filter(a => !isHub(a.slug)).map(a => a.slug);
const padj = new Map(partNodes.map(s => [s, [...(adj.get(s) || [])].filter(n => !isHub(n))]));
const community = new Map(partNodes.map(s => [s, s]));
{
  const order = partNodes.slice().sort();
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (const s of order) {
      const nbrs = padj.get(s);
      if (!nbrs.length) continue;
      const counts = new Map();
      for (const n of nbrs) { const l = community.get(n); counts.set(l, (counts.get(l) || 0) + 1); }
      let best = community.get(s), bestC = counts.get(best) || 0;
      for (const [l, c] of counts)
        if (c > bestC || (c === bestC && String(l) < String(best))) { best = l; bestC = c; }
      if (best !== community.get(s)) { community.set(s, best); changed = true; }
    }
    if (!changed) break;
  }
}
// Group non-hub members, drop singletons (not a community), number by size (largest = 0).
const commMembers = new Map();
for (const s of partNodes) {
  const c = community.get(s);
  if (!commMembers.has(c)) commMembers.set(c, []);
  commMembers.get(c).push(s);
}
const commList = [...commMembers.values()].filter(m => m.length >= 2);
commList.forEach(m => m.sort());
commList.sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]));
const communityIndex = new Map();                            // slug → community id, else -1
commList.forEach((members, id) => members.forEach(s => communityIndex.set(s, id)));
// Attach each hub to the community most of its neighbours sit in (for colour only —
// hubs bridge clusters, so they aren't counted as core members of any one).
for (const a of active) {
  if (!isHub(a.slug)) continue;
  const counts = new Map();
  for (const n of adj.get(a.slug) || []) {
    const c = communityIndex.get(n);
    if (c !== undefined) counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = -1, bestC = 0;
  for (const [c, n] of counts) if (n > bestC || (n === bestC && best !== -1 && c < best)) { best = c; bestC = n; }
  if (best !== -1) communityIndex.set(a.slug, best);
}
const communities = commList.map((members, id) => {
  const hub = members.slice().sort((x, y) => degreeOf(y) - degreeOf(x) || x.localeCompare(y))[0];
  const zones = {};
  for (const s of members) { const z = zoneOf(bySlug[s]); zones[z] = (zones[z] || 0) + 1; }
  return { id, label: bySlug[hub]?.title || hub, hub, size: members.length, zones, members };
});

// God nodes — most-connected concepts. Everything flows through these.
const godNodes = active
  .map(a => ({ slug: a.slug, title: a.title, path: a.path, zone: zoneOf(a), degree: degreeOf(a.slug) }))
  .filter(n => n.degree > 0)
  .sort((x, y) => y.degree - x.degree || x.slug.localeCompare(y.slug))
  .slice(0, 10);
const godSet = new Set(godNodes.map(n => n.slug));

// Surprising connections — links spanning two different zones, rarest pairing first.
// A link routed through a hub is less surprising (hubs connect to everything).
const zonePairCount = new Map();
const crossZone = [];
for (const key of edgeSet) {
  const [a, b] = key.split('|');
  const za = zoneOf(bySlug[a]), zb = zoneOf(bySlug[b]);
  if (za === zb) continue;
  const pair = za < zb ? `${za}|${zb}` : `${zb}|${za}`;
  zonePairCount.set(pair, (zonePairCount.get(pair) || 0) + 1);
  crossZone.push({ a, b, za, zb, pair });
}
const surprises = crossZone
  .map(e => ({
    ...e,
    score: (1 / zonePairCount.get(e.pair)) - ((godSet.has(e.a) || godSet.has(e.b)) ? 0.25 : 0),
    combinedDegree: degreeOf(e.a) + degreeOf(e.b),
  }))
  .sort((x, y) => y.score - x.score || x.combinedDegree - y.combinedDegree || x.a.localeCompare(y.a))
  .slice(0, 8);

// Suggested questions — things the graph is uniquely placed to answer.
const orphanArts = active.filter(a => degreeOf(a.slug) === 0);
const questions = [];
if (godNodes.length >= 2) questions.push(`Jak „${godNodes[0].title}” łączy się z „${godNodes[1].title}”?`);
if (surprises.length) questions.push(`Co łączy strefę \`${surprises[0].za}\` ze strefą \`${surprises[0].zb}\` (${bySlug[surprises[0].a].title} ↔ ${bySlug[surprises[0].b].title})?`);
if (godNodes.length) questions.push(`Które artykuły zależą od „${godNodes[0].title}” — co się rozjedzie, jeśli to zmienimy?`);
if (communities.length >= 2) questions.push(`Czym różni się obszar „${communities[0].label}” od „${communities[1].label}”?`);
if (orphanArts.length) questions.push(`Dlaczego ${orphanArts.length} artykuł(ów) jest niepołączonych z resztą bazy — czego brakuje w linkach?`);

const byTop = {};
for (const a of active) (byTop[a.path.split('/')[0]] ??= []).push(a);

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const INLINE_THRESHOLD = 40; // small bases: also inline the full listing in the root index
const zones = Object.keys(byTop).sort();

// one article → one index line
const line = (a) => {
  const tags = a.tags.length ? ` · \`${a.tags.join(', ')}\`` : '';
  const aka = a.aka && a.aka.length ? ` · aka: ${a.aka.join(', ')}` : '';
  const upd = a.updated ? ` · upd. ${a.updated}` : '';
  const st = a.status !== 'stable' ? ` _(${a.status})_` : '';
  const auth = a.authority && a.authority !== 'primary' ? ` · ⟨${a.authority}⟩` : '';
  const conf = a.confidence === 'inferred' ? ' · 🔍inferred' : '';
  const by = a.author ? ` · by ${a.author}` : '';
  return `- **[${a.title}](${a.path})**${st} — ${a.summary}${tags}${aka}${auth}${conf}${by}${upd}\n`;
};

// per-zone indexes: <zone>/INDEX.md (agent opens only the zone it needs).
// Paginated above ZONE_PAGE so no single index file grows unbounded at scale —
// <zone>/INDEX.md becomes a tiny TOC pointing to <zone>/INDEX.pN.md pages.
const ZONE_PAGE = 150;
const hdr = `> Generated by \`scripts/reindex.mjs\`. Do not edit by hand. See the root \`INDEX.md\` for the map.\n\n`;
for (const top of zones) {
  const list = byTop[top].slice().sort((x, y) => x.path.localeCompare(y.path));
  if (list.length <= ZONE_PAGE) {
    let z = `# INDEX — ${top}\n\n${hdr}${list.length} article(s) · last rebuild: ${stamp}\n\n`;
    for (const a of list) z += line(a);
    writeFileSync(join(ROOT, top, 'INDEX.md'), z);
  } else {
    const pages = [];
    for (let p = 0; p < list.length; p += ZONE_PAGE) pages.push(list.slice(p, p + ZONE_PAGE));
    pages.forEach((pg, idx) => {
      let z = `# INDEX — ${top} (page ${idx + 1}/${pages.length})\n\n${hdr}${pg.length} of ${list.length} article(s) · last rebuild: ${stamp}\n\n`;
      for (const a of pg) z += line(a);
      writeFileSync(join(ROOT, top, `INDEX.p${idx + 1}.md`), z);
    });
    let toc = `# INDEX — ${top} (${list.length} articles · ${pages.length} pages)\n\n${hdr}`;
    toc += `Large zone — paginated. Open the page whose title range covers what you want, or grep / \`INDEX-facets.md\` for a precise lookup.\n\n`;
    pages.forEach((pg, idx) => {
      toc += `- **[page ${idx + 1}](${top}/INDEX.p${idx + 1}.md)** (${pg.length}) — ${pg[0].title} … ${pg[pg.length - 1].title}\n`;
    });
    writeFileSync(join(ROOT, top, 'INDEX.md'), toc);
  }
}

// ── INDEX-facets.md (P3) — jump by tag or entity, then open the articles ──
const facetMap = (key) => {
  const m = new Map();
  for (const a of active) for (const v of (a[key] || [])) {
    if (!m.has(v)) m.set(v, []);
    m.get(v).push(a);
  }
  return [...m.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]));
};
const tagFacets = facetMap('tags');
const entityFacets = facetMap('entities');
// Bounded like every other generated file: cap inline refs per facet so INDEX-facets.md
// stays readable at scale; the newest entries win, the rest is one grep away.
const FACET_MAX_REFS = 40;
const refs = (arr) => {
  const sorted = arr.slice().sort((x, y) => String(y.updated).localeCompare(String(x.updated)));
  const shown = sorted.slice(0, FACET_MAX_REFS).map(a => `[${a.title}](${a.path})`).join(', ');
  const more = arr.length - FACET_MAX_REFS;
  return more > 0 ? `${shown} … **+${more} more** (grep the term across \`*/*.md\`)` : shown;
};
let fac = `# FACETS — tags & entities\n\n`;
fac += `> Generated by \`scripts/reindex.mjs\`. Open this to find every article carrying a given tag\n`;
fac += `> or entity (client / product / person), then open the articles. For free-text lookup, grep instead.\n`;
fac += `> Facets with many articles show the ${FACET_MAX_REFS} most recently updated — grep for the full set.\n\n`;
fac += `## 🏷 Tags\n\n`;
fac += tagFacets.length ? tagFacets.map(([t, as]) => `- \`${t}\` (${as.length}) — ${refs(as)}`).join('\n') + '\n' : '_none yet_\n';
fac += `\n## 🔖 Entities\n\n`;
fac += entityFacets.length ? entityFacets.map(([e, as]) => `- **${e}** (${as.length}) — ${refs(as)}`).join('\n') + '\n' : '_none yet (add \`entities: [client, product]\` to frontmatter)_\n';
writeFileSync(join(ROOT, 'INDEX-facets.md'), fac);

// ── GAPS.md (P-gaps) — what's incomplete / unverified ──────────────────────────
// Agents: treat ⚠ items as UNKNOWN (not fact). User: this is your fill-in to-do list.
const flagged = [];
for (const a of active) {
  const ls = a._body.split('\n').map(l => l.trim()).filter(l => l.includes('⚠'));
  if (a.summary.includes('⚠')) ls.unshift(`summary: ${a.summary}`);
  if (ls.length) flagged.push({ a, ls });
}
const draftList = active.filter(a => a.status === 'draft');
const staleList = active.filter(a => { const t = Date.parse(a.updated); return !Number.isNaN(t) && (_now - t) / 86400000 > STALE_DAYS; });
const gapsTotal = flagged.length + draftList.length + staleList.length;
let gaps = `# GAPS — what's incomplete or unverified\n\n`;
gaps += `> Generated by \`scripts/reindex.mjs\`. Do not edit by hand. Fill these in.\n`;
gaps += `> Agents: treat \`⚠\` items as UNKNOWN — do not present them as fact.\n\n`;
gaps += `Flagged: **${flagged.length}** · drafts: **${draftList.length}** · stale: **${staleList.length}** · rebuilt ${stamp}\n`;
gaps += `\n## ⚠ Flagged — to fill in\n\n`;
gaps += flagged.length ? flagged.map(({ a, ls }) =>
  `- **[${a.title}](${a.path})**\n` + ls.map(l => `  - ${l}`).join('\n')).join('\n') + '\n' : '_none_\n';
gaps += `\n## 📝 Drafts\n\n`;
gaps += draftList.length ? draftList.map(a => `- [${a.title}](${a.path})`).join('\n') + '\n' : '_none_\n';
gaps += `\n## 🕰 Stale (updated > 6 months)\n\n`;
gaps += staleList.length ? staleList.map(a => `- [${a.title}](${a.path}) — upd. ${a.updated}`).join('\n') + '\n' : '_none_\n';
// T21: articles the AI inferred rather than a human verifying — check against a primary source.
const inferredList = active.filter(a => a.confidence === 'inferred');
gaps += `\n## 🔍 Inferred (AI-derived — verify against a primary source)\n\n`;
gaps += inferredList.length ? inferredList.map(a => `- [${a.title}](${a.path})${a.source ? ` — src: ${a.source}` : ''}`).join('\n') + '\n' : '_none_\n';
// Personal context drifts faster than company facts — flag owner/partner personal contexts
// not refreshed in 90 days (life priorities shift). Nudge toward /kb-onboard or /kb-align.
const PERSONAL_STALE_DAYS = 90;
const personalStale = active.filter(a => a.type === 'PersonalContext' && (() => {
  const t = Date.parse(a.updated); return !Number.isNaN(t) && (_now - t) / 86400000 > PERSONAL_STALE_DAYS;
})());
gaps += `\n## 🔄 Personal context to refresh (life priorities shift — > 90 days)\n\n`;
gaps += personalStale.length ? personalStale.map(a => `- [${a.title}](${a.path}) — upd. ${a.updated} · run \`/kb-onboard\` then \`/kb-align\``).join('\n') + '\n' : '_none_\n';
writeFileSync(join(ROOT, 'GAPS.md'), gaps);

// ── INSIGHTS.md — structure the folder view can't show ──────────────────────────
// God nodes, surprising cross-zone links, communities and the questions the graph
// is uniquely placed to answer. The human-readable audit trail over graph.json.
let ins = `# INSIGHTS — structure of the base\n\n`;
ins += `> Generated by \`scripts/reindex.mjs\`. Do not edit by hand.\n`;
ins += `> The base is a graph: \`[[wikilinks]]\` are edges. This surfaces what folders hide —\n`;
ins += `> the most-connected concepts, hidden cross-zone links, and questions worth asking.\n\n`;
ins += `Nodes: **${active.length}** · edges: **${edgeSet.size}** · communities: **${communities.length}** · orphans: **${orphanArts.length}** · rebuilt ${stamp}\n`;
ins += `\n## 🧭 God nodes (most connected — everything flows through these)\n\n`;
ins += godNodes.length
  ? godNodes.map((n, i) => `${i + 1}. **[${n.title}](${n.path})** — ${n.degree} link(s) · \`${n.zone}\``).join('\n') + '\n'
  : '_no links yet — connect articles with [[slug]]_\n';
ins += `\n## 🔗 Surprising connections (links across zones, rarest pairing first)\n\n`;
ins += surprises.length
  ? surprises.map(e => `- [${bySlug[e.a].title}](${bySlug[e.a].path}) \`${e.za}\` ↔ [${bySlug[e.b].title}](${bySlug[e.b].path}) \`${e.zb}\``).join('\n') + '\n'
  : '_no cross-zone links yet_\n';
ins += `\n## 🌐 Communities (clusters by link density, independent of folders)\n\n`;
if (communities.length) {
  for (const c of communities.slice(0, 12)) {
    const zoneStr = Object.entries(c.zones).sort((a, b) => b[1] - a[1]).map(([z, n]) => `${z}×${n}`).join(', ');
    ins += `- **${c.label}** — ${c.size} node(s) · ${zoneStr}\n`;
  }
} else ins += '_not enough link structure yet_\n';
ins += `\n## ❓ Suggested questions (the graph can answer these)\n\n`;
ins += questions.length ? questions.map(q => `- ${q}`).join('\n') + '\n' : '_—_\n';
writeFileSync(join(ROOT, 'INSIGHTS.md'), ins);

// ── graph.json — portable node/edge graph for tools, queries and the viewer ─────
// Node-link format (like Graphify's graph.json): stable slugs, degree + community
// per node, undirected edge count. Safe to commit; regenerated every reindex.
const graph = {
  generatedAt: new Date().toISOString(),
  directed: false,
  stats: { nodes: active.length, edges: edgeSet.size, communities: communities.length, orphans: orphanArts.length },
  nodes: active.map(a => ({
    id: a.slug, label: a.title, path: a.path, zone: zoneOf(a), type: a.type,
    degree: degreeOf(a.slug),
    community: communityIndex.has(a.slug) ? communityIndex.get(a.slug) : -1,
    confidence: a.confidence || undefined,
  })),
  edges: edgeList,
  communities: communities.map(({ id, label, hub, size, zones }) => ({ id, label, hub, size, zones })),
  godNodes: godNodes.map(n => n.slug),
};
writeFileSync(join(ROOT, 'graph.json'), JSON.stringify(graph, null, 2));

// ── BOARD.md — kanban view of the tasks/ zone (generated, gitignored) ─────────
// One task = one file (no merge conflicts between users). Columns by task status,
// grouped by project; ⏰ marks overdue. Done column capped so the file stays bounded.
const taskArts = active.filter(a => a.path.split('/')[0] === 'tasks');
const today = new Date().toISOString().slice(0, 10);
const DONE_SHOWN = 15;
const taskLine = (t) => {
  const overdue = t.due && t.due < today && t.status !== 'done' ? ' ⏰**overdue**' : '';
  const bits = [
    t.assignees.length ? `👤 ${t.assignees.join(', ')}` : '👤 _unassigned_',
    t.project ? `📁 ${t.project}` : '',
    t.due ? `📅 ${t.due}${overdue}` : '',
    t.priority ? `⚡ ${t.priority}` : '',
    t.recur ? `🔁 ${t.recur}` : '',
  ].filter(Boolean).join(' · ');
  return `- **[${t.title}](${t.path})** — ${bits}\n`;
};
const openCount = taskArts.filter(t => t.status !== 'done').length;
let board = `# BOARD — tasks (kanban)\n\n`;
board += `> Generated by \`scripts/reindex.mjs\`. Do not edit by hand — edit the task files in \`tasks/\`\n`;
board += `> (or ask the assistant: "add a task", "mark X as done", "what's on my plate?").\n\n`;
board += `Open: **${openCount}** · done: ${taskArts.length - openCount} · rebuilt ${stamp}\n`;
for (const st of TASK_STATES) {
  let col = taskArts.filter(t => t.status === st);
  const emoji = { todo: '📥', doing: '🔨', blocked: '🚧', done: '✅' }[st];
  board += `\n## ${emoji} ${st} (${col.length})\n\n`;
  if (!col.length) { board += `_empty_\n`; continue; }
  if (st === 'done') {
    col = col.slice().sort((x, y) => String(y.updated).localeCompare(String(x.updated)));
    const hidden = col.length - DONE_SHOWN;
    col = col.slice(0, DONE_SHOWN);
    for (const t of col) board += taskLine(t);
    if (hidden > 0) board += `- _…+${hidden} more done (see \`tasks/INDEX.md\` or grep)_\n`;
  } else {
    // group open work by project for scanability
    const byProj = {};
    for (const t of col) (byProj[t.project || '(no project)'] ??= []).push(t);
    for (const p of Object.keys(byProj).sort()) {
      if (Object.keys(byProj).length > 1) board += `**${p}**\n`;
      for (const t of byProj[p].sort((x, y) => String(x.due || '9999').localeCompare(String(y.due || '9999')))) board += taskLine(t);
    }
  }
}
writeFileSync(join(ROOT, 'BOARD.md'), board);

// root INDEX.md — the MAP the agent reads first
let idx = `# INDEX — knowledge base (map)\n\n`;
idx += `> Generated automatically by \`scripts/reindex.mjs\`. Do not edit by hand.\n`;
idx += `> LLM: read this map FIRST. Then open the relevant **zone index** (e.g. \`projects/INDEX.md\`),\n`;
idx += `> then open only the 1–5 articles you need and follow \`[[links]]\`. For a precise lookup in a\n`;
idx += `> large base, grep titles/summaries/tags — or open \`INDEX-facets.md\` to jump by tag/entity.\n\n`;
idx += `Articles: **${active.length}**${archived.length ? ` (+${archived.length} archived)` : ''} · last rebuild: ${stamp}\n`;

// ⭐ Start here — always-on core context
const starters = [
  ['CONTEXT.md', '⭐ Who the owner is, goals, active work, preferences — read every session'],
  ['now.md', '🎯 Current focus (this week / quarter)'],
];
const present = starters.filter(([p]) => existsSync(join(ROOT, p)));
if (present.length) {
  idx += `\n## ⭐ Start here (read first)\n\n`;
  for (const [p, desc] of present) idx += `- **[${p}](${p})** — ${desc}\n`;
}

idx += `\n## 🔎 Lookup\n\n`;
idx += `- **[INDEX-facets.md](INDEX-facets.md)** — jump by tag or entity (client / product / person).\n`;
idx += `- Free-text: grep titles/summaries/tags, e.g. \`rg -i "term" */*.md\`.\n`;
if (edgeSet.size) idx += `- **[INSIGHTS.md](INSIGHTS.md)** — structure: god nodes, surprising cross-zone links, suggested questions.\n`;
if (existsSync(join(ROOT, 'LESSONS.md'))) idx += `- **[LESSONS.md](LESSONS.md)** — work memory: preferred sources, contested facts, known dead ends (from \`/kb-reflect\`).\n`;
if (gapsTotal) idx += `- **[GAPS.md](GAPS.md)** — ${gapsTotal} incomplete/unverified item(s) (⚠ = treat as unknown).\n`;
if (taskArts.length) idx += `- **[BOARD.md](BOARD.md)** — task board (kanban): **${openCount} open**, ${taskArts.length - openCount} done.\n`;

if (briefs.length) {
  idx += `\n## 📋 Briefs (read before working in a given folder)\n\n`;
  for (const b of briefs.sort((x, y) => x.folder.localeCompare(y.folder)))
    idx += `- **[${b.folder}](${b.path})** — ${b.title}\n`;
}

// zone map: counts + link to each zone index
idx += `\n## 🗂 Zones (open the zone index, then the article)\n\n`;
for (const top of zones)
  idx += `- **[${top}/](${top}/INDEX.md)** — ${byTop[top].length} article(s)\n`;

// small base: also inline the full listing so nothing is lost at low scale
if (active.length <= INLINE_THRESHOLD) {
  for (const top of zones) {
    idx += `\n## ${top}\n\n`;
    for (const a of byTop[top].sort((x, y) => x.path.localeCompare(y.path))) idx += line(a);
  }
}

writeFileSync(join(ROOT, 'INDEX.md'), idx);

// ── kb-data.js (rich, for viewer.html) ──────────────────────────────────────
// `config` is already loaded + validated above.
const data = {
  company: config.company || { name: 'Myriad Self OS' },
  // Feature toggles + base version — the viewer shows them (⚙️ Settings view);
  // agents flip them via /kb-settings (edits knowledge.config.json).
  features: config.features || {},
  version: config.version || '',
  generatedAt: new Date().toISOString(),
  // Graph layer for the viewer Map view: communities (colour), god nodes (highlight).
  communities: communities.map(({ id, label, hub, size, zones }) => ({ id, label, hub, size, zones })),
  godNodes: godNodes.map(n => n.slug),
  articles: articles.map(a => ({
    slug: a.slug, title: a.title, path: a.path, category: a.category,
    type: a.type, resource: a.resource,
    summary: a.summary, tags: a.tags, entities: a.entities, aka: a.aka,
    status: a.status, updated: a.updated,
    source: a.source, authority: a.authority, confidence: a.confidence, author: a.author,
    assignees: a.assignees, project: a.project, due: a.due, priority: a.priority, recur: a.recur,
    links: a.links, backlinks: backlinks[a.slug],
    // Graph metrics (degree = connectivity, community id or -1) — power the Map view.
    degree: degreeOf(a.slug), community: communityIndex.has(a.slug) ? communityIndex.get(a.slug) : -1,
    html: mdToHtml(a._body, slugs),
  })),
  briefs: briefs.map(b => ({
    folder: b.folder, path: b.path, title: b.title,
    html: mdToHtml(b._body, slugs),
  })),
};
const js = `window.KB_DATA = ${JSON.stringify(data, null, 2).replace(/<\/script>/gi, '<\\/script>')};`;
writeFileSync(join(ROOT, 'kb-data.js'), js);

console.log(`\n✓ Wrote INDEX.md (${(idx.length / 1024).toFixed(1)} KB) + kb-data.js (${(js.length / 1024).toFixed(1)} KB)\n`);
