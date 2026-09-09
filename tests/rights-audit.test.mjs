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
