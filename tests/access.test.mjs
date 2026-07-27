// Access tests — department editions: what kb-build ships down and what kb-collect lets up.
// Black-box against the shipped scripts, on a throwaway base stamped from template/.
//
// There are no employees to try this on for real, so every gate has to be proven here:
// the first time a rejection path matters in production, a miss costs a leak.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'template');

function write(base, rel, fm, body = 'Body text that is comfortably long enough.') {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n' + body + '\n');
}

// A base with two departments, an owner and one employee per department.
function makeMaster() {
  const base = mkdtempSync(join(tmpdir(), 'kb-master-'));
  cpSync(TEMPLATE, base, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(base, 'knowledge.config.json'), 'utf8'));
  cfg.departments = ['sales', 'marketing'];
  cfg.roster = { 'boss@example.com': 'boss', 'sam@example.com': 'sam' };
  writeFileSync(join(base, 'knowledge.config.json'), JSON.stringify(cfg, null, 2));

  write(base, 'people/boss.md', { title: 'Boss', slug: 'boss', category: 'people', summary: 'The owner of the company.', status: 'stable', owner: 'true' });
  write(base, 'people/sam.md', { title: 'Sam', slug: 'sam', category: 'people', summary: 'Sales rep, works the pipeline.', status: 'stable', department: 'sales' });
  write(base, 'people/boss-personal.md', { title: 'Boss personal', slug: 'boss-personal', category: 'people', summary: 'Private drivers of the owner.', status: 'stable' });

  write(base, 'concepts/shared.md', { title: 'Shared', slug: 'shared', category: 'concepts', summary: 'Company-wide knowledge everyone reads.', status: 'stable', visibility: 'company' });
  write(base, 'departments/sales/playbook.md', { title: 'Playbook', slug: 'playbook', category: 'departments/sales', summary: 'How the sales team runs its calls.', status: 'stable', visibility: 'department', department: 'sales' });
  write(base, 'departments/marketing/plan.md', { title: 'Plan', slug: 'plan', category: 'departments/marketing', summary: 'The marketing plan for this quarter.', status: 'stable', visibility: 'department', department: 'marketing' });
  write(base, 'meetings/payroll.md', { title: 'Payroll', slug: 'payroll', category: 'meetings', summary: 'Salary review notes, owners only.', status: 'stable' });
  // A company article linking to something the sales edition will not receive.
  write(base, 'concepts/linker.md', { title: 'Linker', slug: 'linker', category: 'concepts', summary: 'Links out to a withheld article.', status: 'stable', visibility: 'company' },
    'See [[payroll]] and [[shared]] for context.');
  return base;
}

const build = (base, dept, out, extra = []) =>
  execFileSync('node', ['scripts/kb-build.mjs', '--dept', dept, '--out', out, ...extra], { cwd: base, encoding: 'utf8' });

function collect(base, dept, from, extra = []) {
  const r = spawnSync('node', ['scripts/kb-collect.mjs', '--dept', dept, '--from', from, ...extra], { cwd: base, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('edition carries company + own department, and nothing else', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-' + Date.now());
  build(base, 'sales', out);

  assert.ok(existsSync(join(out, 'concepts/shared.md')), 'company article must ship');
  assert.ok(existsSync(join(out, 'departments/sales/playbook.md')), 'own department must ship');
  assert.ok(!existsSync(join(out, 'departments/marketing/plan.md')), 'another department must NOT ship');
  assert.ok(!existsSync(join(out, 'meetings/payroll.md')), 'owners-only must NOT ship');
  assert.ok(!existsSync(join(out, 'people/boss-personal.md')), 'personal context must NOT ship');
  rmSync(out, { recursive: true, force: true });
});

test('an unclassified article stays behind (fail-closed)', () => {
  const base = makeMaster();
  write(base, 'concepts/forgot.md', { title: 'Forgot', slug: 'forgot', category: 'concepts', summary: 'Nobody set a visibility field here.', status: 'stable' });
  // concepts/ defaults to company, so prove the default itself with a zone that has no rule.
  write(base, 'products/secret-pricing.md', { title: 'Pricing', slug: 'secret-pricing', category: 'products', summary: 'Unit economics nobody classified.', status: 'stable' });
  const out = join(base, '..', 'kb-sales-fc-' + Date.now());
  build(base, 'sales', out);
  assert.ok(!existsSync(join(out, 'products/secret-pricing.md')), 'unmapped zone must default to owners');
  rmSync(out, { recursive: true, force: true });
});

test('generated zone indexes never ship — they name what was withheld', () => {
  const base = makeMaster();
  execFileSync('node', ['scripts/reindex.mjs'], { cwd: base, encoding: 'utf8' });
  assert.ok(existsSync(join(base, 'meetings/INDEX.md')), 'precondition: reindex writes zone indexes');
  const out = join(base, '..', 'kb-sales-idx-' + Date.now());
  build(base, 'sales', out);

  assert.ok(!existsSync(join(out, 'meetings/INDEX.md')), 'an owners-only zone index must not ship');
  assert.ok(!existsSync(join(out, 'concepts/INDEX.md')), 'zone indexes are generated — rebuilt locally, never shipped');
  assert.ok(!existsSync(join(out, 'INDEX.md')), 'the root map is generated too');
  rmSync(out, { recursive: true, force: true });
});

test('links pointing outside the edition are rewritten, not left dead', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-links-' + Date.now());
  build(base, 'sales', out);
  const txt = readFileSync(join(out, 'concepts/linker.md'), 'utf8');
  assert.match(txt, /payroll \(outside your edition\)/, 'withheld target must be defused');
  assert.match(txt, /\[\[shared\]\]/, 'a target still present must stay a link');
  rmSync(out, { recursive: true, force: true });
});

test('rebuild preserves what the team owns and drops what was reclassified', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-re-' + Date.now());
  build(base, 'sales', out);

  // The team writes in its own zone…
  write(out, 'departments/sales/objections.md', { title: 'Objections', slug: 'objections', category: 'departments/sales', summary: 'Objection handling written by the team.', status: 'stable', visibility: 'department', department: 'sales' });
  // …and the owner pulls a company article back to owners-only.
  write(base, 'concepts/shared.md', { title: 'Shared', slug: 'shared', category: 'concepts', summary: 'Company-wide knowledge everyone reads.', status: 'stable', visibility: 'owners' });
  build(base, 'sales', out);

  assert.ok(existsSync(join(out, 'departments/sales/objections.md')), 'edition-owned file must survive a rebuild');
  assert.ok(!existsSync(join(out, 'concepts/shared.md')), 'reclassified article must be removed from the edition');
  rmSync(out, { recursive: true, force: true });
});

test('collect accepts the team writing inside its own zone', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-ok-' + Date.now());
  build(base, 'sales', out);
  write(out, 'departments/sales/objections.md', { title: 'Objections', slug: 'objections', category: 'departments/sales', summary: 'Objection handling written by the team.', status: 'stable', visibility: 'department', department: 'sales' });

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(base, 'departments/sales/objections.md')), 'accepted work must land in the master');
  rmSync(out, { recursive: true, force: true });
});

test('an edit to a master-owned file is never imported, and the team is told', () => {
  const base = makeMaster();
  const before = readFileSync(join(base, 'CONTEXT.md'), 'utf8');
  const out = join(base, '..', 'kb-sales-path-' + Date.now());
  build(base, 'sales', out);
  write(out, 'departments/sales/good.md', { title: 'Good', slug: 'good', category: 'departments/sales', summary: 'A perfectly fine department note.', status: 'stable', visibility: 'department', department: 'sales' });
  writeFileSync(join(out, 'CONTEXT.md'), '# Rewritten company context\n');

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(base, 'CONTEXT.md'), 'utf8'), before, 'master-owned file must be untouched');
  assert.match(r.out, /master-owned file\(s\) were edited/);
  assert.match(r.out, /CONTEXT\.md/);
  // Their legitimate work still lands — a stray edit elsewhere must not punish it.
  assert.ok(existsSync(join(base, 'departments/sales/good.md')));
  rmSync(out, { recursive: true, force: true });
});

test('collect rejects self-promotion to company', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-promo-' + Date.now());
  build(base, 'sales', out);
  write(out, 'departments/sales/loud.md', { title: 'Loud', slug: 'loud', category: 'departments/sales', summary: 'An article trying to reach everyone.', status: 'stable', visibility: 'company' });

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 1);
  assert.match(r.out, /PROMOTION/);
  rmSync(out, { recursive: true, force: true });
});

test('collect rejects a foreign department claim', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-foreign-' + Date.now());
  build(base, 'sales', out);
  write(out, 'departments/sales/reach.md', { title: 'Reach', slug: 'reach', category: 'departments/sales', summary: 'Claims to belong to marketing too.', status: 'stable', visibility: 'department', department: '[sales, marketing]' });

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 1);
  assert.match(r.out, /PROMOTION/);
  rmSync(out, { recursive: true, force: true });
});

test('collect rejects a planted secret', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-secret-' + Date.now());
  build(base, 'sales', out);
  write(out, 'departments/sales/creds.md', { title: 'Creds', slug: 'creds', category: 'departments/sales', summary: 'Notes that accidentally carry a token.', status: 'stable', visibility: 'department', department: 'sales' },
    'token = ghp_' + 'A'.repeat(32));

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 1);
  assert.match(r.out, /SECRET/);
  rmSync(out, { recursive: true, force: true });
});

test("collect rejects a journal entry belonging to someone outside the department", () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-journal-' + Date.now());
  build(base, 'sales', out);
  mkdirSync(join(out, 'journal/boss'), { recursive: true });
  writeFileSync(join(out, 'journal/boss/2026-01-01.md'), '# Not theirs to write\n');

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 1);
  assert.match(r.out, /not in department "sales"/);
  rmSync(out, { recursive: true, force: true });
});

test('collect never deletes from the master without an explicit flag', () => {
  const base = makeMaster();
  const out = join(base, '..', 'kb-sales-del-' + Date.now());
  build(base, 'sales', out);
  rmSync(join(out, 'departments/sales/playbook.md'), { force: true });

  const r = collect(base, 'sales', out);
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(join(base, 'departments/sales/playbook.md')), 'deletion must not propagate by default');
  assert.match(r.out, /NOT applied/);
  rmSync(out, { recursive: true, force: true });
});

test('reindex flags an unknown visibility value', () => {
  const base = makeMaster();
  write(base, 'concepts/bad.md', { title: 'Bad', slug: 'bad', category: 'concepts', summary: 'Carries a visibility nobody supports.', status: 'stable', visibility: 'everyone' });
  const out = execFileSync('node', ['scripts/reindex.mjs', '--lint'], { cwd: base, encoding: 'utf8' });
  assert.match(out, /Unknown visibility "everyone"/);
});

test('reindex flags department visibility with no department', () => {
  const base = makeMaster();
  write(base, 'concepts/nodept.md', { title: 'No dept', slug: 'nodept', category: 'concepts', summary: 'Department reach without a department.', status: 'stable', visibility: 'department' });
  const out = execFileSync('node', ['scripts/reindex.mjs', '--lint'], { cwd: base, encoding: 'utf8' });
  assert.match(out, /needs a "department:" field/);
});
