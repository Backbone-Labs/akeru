import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateRightsAudit, verifyAuditSources } from '../scripts/validate-rights-audit.mjs';
const read = path => JSON.parse(readFileSync(path));
const audit = read('compliance/rights-audits/freedm.json');
const inventory = read('compliance/source-inventories/freedm.json');
test('rights audit covers the pinned source trees without approving titles', () => {
  assert.deepEqual(validateRightsAudit(audit, inventory), {files:3849,groups:16,evidence:56});
  assert.equal(validateRightsAudit(read('compliance/rights-audits/anarch.json'),read('compliance/source-inventories/anarch.json')).files,248);
});
test('missing files, overlapping groups and source pin drift fail closed', () => {
  for (const mutate of [a => a.groups.pop(), a => a.groups.push({...a.groups[0],id:'overlap'}), a => a.revision='a'.repeat(40), a => a.evidence[0].gitObjectId='b'.repeat(40), a => a.approvalStatus='approved']) {
    const copy=structuredClone(audit);mutate(copy);assert.throws(()=>validateRightsAudit(copy,inventory));
  }
});
test('GPL generators cannot be relabeled BSD through the repository license', () => {
  const copy=structuredClone(audit), group=copy.groups.find(g=>g.declaredLicense==='GPL-2.0-or-later');
  group.declaredLicense='BSD-3-Clause';group.evidence=['COPYING.adoc'];
  assert.throws(()=>validateRightsAudit(copy,inventory),/root license/);
  group.basis='inherited-project-claim';
  assert.throws(()=>validateRightsAudit(copy,inventory),/downgraded/);
});
test('inherited and contradictory declarations retain their uncertainty', () => {
  for (const id of ['denex-font','appstream-metadata-conflict']) {
    const copy=structuredClone(audit);copy.groups.find(g=>g.id===id).unknowns=[];
    assert.throws(()=>validateRightsAudit(copy,inventory));
  }
});
test('optional local verification checks the actual bytes, not only a recorded hash', () => {
  const dir=mkdtempSync(join(tmpdir(),'akeru-rights-'));
  try {
    const bytes=Buffer.from('example notice\n');writeFileSync(join(dir,'NOTICE'),bytes);
    const fixture={evidence:[{path:'NOTICE',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),gitObjectId:createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')}]};
    verifyAuditSources(fixture,dir);writeFileSync(join(dir,'NOTICE'),'changed notice');
    assert.throws(()=>verifyAuditSources(fixture,dir),/bytes differ/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('current Freedoom credits account for every level and MIDI source without absorbing historical credits', () => {
  const map=read('compliance/rights-audits/freedoom-credit-map.json');
  assert.equal(map.revision,inventory.revision);assert.equal(map.approvalStatus,'pending');
  assert.equal(map.records.length,211);assert.equal(new Set(map.records.map(r=>r.sourcePath)).size,211);
  const evidence=new Map(audit.evidence.map(e=>[e.path,e]));
  for(const row of map.records){
    assert.equal(inventory.files.find(f=>f.path===row.sourcePath)?.gitObjectId,row.gitObjectId);
    assert.ok(row.creditLine>0 && row.creditLine<=evidence.get(row.creditPath).lineCount);
    assert.ok(row.buildcfgLine>0 && row.buildcfgLine<=evidence.get('buildcfg.txt').lineCount);
    assert.match(row.outputLump,/^[A-Z0-9_]{1,8}$/);
    assert.ok(['freedoom1.wad','freedoom2.wad','freedm.wad'].includes(row.outputWad));
  }
  const accounted=[...map.records.map(r=>r.sourcePath),...map.unmappedSourcePaths].sort();
  const files=inventory.files.filter(f=>/^levels\/.*\.wad$|^musics\/.*\.mid$/.test(f.path)).map(f=>f.path).sort();
  assert.deepEqual(accounted,files);
  assert.deepEqual(map.unmappedSourcePaths,['levels/dummy.wad','levels/test_levels.wad','musics/dummy.mid']);
  assert.equal(map.records.find(r=>r.sourcePath==='musics/d_dm01.mid').outputLump,'D_RUNNIN');
  assert.equal(map.records.find(r=>r.sourcePath==='levels/dm01.wad').outputLump,'MAP01');
  // Current Phase 1 E1M1 is line 9; a previous-release credit must not replace it.
  assert.equal(map.records.find(r=>r.sourcePath==='musics/d_e1m1.mid').creditLine,9);
});

test('every candidate has a scoped audit at its source pin; shared Freedoom tree is counted once', () => {
  const candidates=read('compliance/candidates.json');
  const index=read('compliance/rights-audits/index.json');
  assert.deepEqual(index.map(i=>i.titleId).sort(),candidates.map(c=>c.id).sort());
  const results=new Map();
  for(const row of index){
    const a=read(`compliance/rights-audits/${row.audit}`), c=candidates.find(c=>c.id===row.titleId);
    assert.ok(a.titleIds.includes(row.titleId));assert.equal(a.revision,c.identity.observedRevision);
    assert.equal(a.upstreamUrl,c.identity.upstreamUrl);
    results.set(row.audit,validateRightsAudit(a,read(`compliance/source-inventories/${a.inventory}`)));
  }
  assert.equal(results.size,9);
  assert.equal([...results.values()].reduce((sum,r)=>sum+r.files,0),11061);
  assert.equal([...results.values()].reduce((sum,r)=>sum+r.groups,0),119);
});

test('submodule pointers and scoped font declarations cannot inherit the parent code license', () => {
  const a=read('compliance/rights-audits/hypersomnia.json'), i=read('compliance/source-inventories/hypersomnia.json');
  const g=a.groups.find(g=>g.id==='unexpanded-submodules');g.basis='inherited-project-claim';g.declaredLicense='AGPL-3.0-only';g.evidence=['LICENSE.md'];
  assert.throws(()=>validateRightsAudit(a,i),/submodules/);
  const h=read('compliance/rights-audits/hextris.json');
  h.groups.find(g=>g.id==='fontawesome-fonts').declaredLicense='GPL-3.0-or-later';
  assert.throws(()=>validateRightsAudit(h,read('compliance/source-inventories/hextris.json')),/Referenced declaration/);
});

test('asset exclusions and external dependency gaps remain explicit', () => {
  const a=read('compliance/rights-audits/hypersomnia.json');
  for(const id of ['social-brand-exception','editor-icon-exception']){
    const g=a.groups.find(g=>g.id===id);assert.equal(g.basis,'unknown');assert.equal(g.declaredLicense,null);assert.ok(g.unknowns.length);
  }
  const s=read('compliance/rights-audits/server-survival.json');
  assert.ok(s.externalDependencyEvidence.runtimeExceptions.some(e=>e.includes('Three.js')));
  assert.equal(read('compliance/rights-audits/open-golf.json').groups.find(g=>g.id==='coi-serviceworker-0.1.6').basis,'file-declaration');
});
