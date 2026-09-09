import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, inventoryCheckout } from '../scripts/source-inventory.mjs';
import { execFileSync } from 'node:child_process';
const sha = 'a'.repeat(40);
const entry = {path:'font.ttf',sha,mode:'100644',type:'blob'};
test('source inventory preserves pins and never infers rights from paths',()=>{
 const r=createInventory('https://example.org/game',sha,[entry,{...entry,path:'LICENSE'}]);
 assert.equal(r.files[0].path,'LICENSE');
 assert.ok(r.files.every(f=>f.rightsStatus==='unreviewed'));
 assert.equal(r.files[1].gitObjectId,sha);
});
test('inventory rejects moving refs, credentials, malformed objects and path collisions',()=>{
 assert.throws(()=>createInventory('https://example.org/game','main',[entry]));
 assert.throws(()=>createInventory('https://user:secret@example.org/game',sha,[entry]));
 for(const patch of [{path:'../secret'},{path:'/secret'},{path:'x\\secret'},{path:'x\nsecret'},{sha:'bad'},{mode:'160000'}]) assert.throws(()=>createInventory('https://example.org/game',sha,[{...entry,...patch}]));
 assert.throws(()=>createInventory('https://example.org/game',sha,[entry,entry]));
});
test('symlinks and submodules are flagged, not dereferenced or executed',()=>{
 const r=createInventory('https://example.org/game',sha,[{...entry,path:'link',mode:'120000'},{...entry,path:'dep',mode:'160000',type:'commit'}]);
 assert.deepEqual(r.files.map(f=>f.kind),['submodule','symlink']);
});
test('checkout inventory reads committed objects even with unrelated working files',()=>{
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const r=inventoryCheckout('.',revision,'https://example.org/original-fixture');
 assert.ok(r.files.some(f=>f.path==='LICENSE'));
 assert.equal(r.revision,revision);
});

import { readFileSync } from 'node:fs';
test('every candidate has a complete source path baseline at its recorded revision',()=>{
 const candidates=JSON.parse(readFileSync('compliance/candidates.json'));
 const index=JSON.parse(readFileSync('compliance/source-inventories/index.json'));
 assert.equal(index.length,candidates.length);
 for(const c of candidates){
  const matches=index.filter(i=>i.titleId===c.id);assert.equal(matches.length,1);
  const inventory=JSON.parse(readFileSync(`compliance/source-inventories/${matches[0].inventory}`));
  assert.equal(inventory.revision,c.identity.observedRevision);assert.equal(inventory.upstreamUrl,c.identity.upstreamUrl);
  assert.deepEqual(createInventory(inventory.upstreamUrl,inventory.revision,inventory.files.map(f=>({path:f.path,sha:f.gitObjectId,mode:f.mode,type:f.kind==='submodule'?'commit':'blob'}))),inventory);
 }
});
test('source evidence binds a real inventoried path without asserting clearance',()=>{
 const index=JSON.parse(readFileSync('compliance/source-inventories/index.json'));
 const evidence=JSON.parse(readFileSync('compliance/source-evidence.json'));
 for(const e of evidence){
  const inventory=JSON.parse(readFileSync(`compliance/source-inventories/${index.find(i=>i.titleId===e.titleId).inventory}`));
  assert.equal(inventory.files.find(f=>f.path===e.path)?.gitObjectId,e.gitObjectId);
  assert.match(e.sha256,/^[a-f0-9]{64}$/);assert.equal(e.rightsStatus,'unreviewed');
 }
});
