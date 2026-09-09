import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublishedCatalog } from '../platform/catalog/registry.mjs';
import { validateCatalog, filterEntries, routeFor, titleUrl, createShellTelemetry } from '../platform/catalog/model.js';
import { createRuntimeChannel } from '../platform/catalog/channel.js';
const manifest=JSON.parse(readFileSync('examples/contract-fixture/akeru.json'));
const candidate=()=>({manifest:structuredClone(manifest),release:{digest:'a'.repeat(64),origin:'https://one.games.example'},metadata:{summary:'Original test',description:'A synthetic registry fixture.',category:'sandbox',creator:'Test',ageLabel:'Test fixture',controls:{controller:['Move'],touch:['Tap']},privacy:['No requests'],notices:[{label:'License',url:'https://example.com/license'}]},availability:'available'});
const registry=entry=>({schemaVersion:'0.1.0',mode:'production',entries:[entry]});
test('publication is independently denied by default; manifest validity and documented rights grant nothing',async()=>{
  assert.deepEqual((await createPublishedCatalog([candidate()])).entries,[]);
  const c=candidate();let checked;
  const result=await createPublishedCatalog([c],{shellOrigin:'https://shell.example',verifyPublication:identity=>{checked=identity;return true;}});
  assert.equal(result.entries.length,1);assert.equal(checked.id,c.manifest.id);assert.equal(checked.releaseDigest,c.release.digest);assert.match(checked.manifestDigest,/^[a-f0-9]{64}$/);
  assert.equal(checked.origin,c.release.origin);assert.equal(checked.version,c.manifest.version);
  for(const answer of ['approved',{},1])assert.equal((await createPublishedCatalog([c],{verifyPublication:()=>answer})).entries.length,0);
  c.manifest.publication='approved';await assert.rejects(createPublishedCatalog([c],{verifyPublication:()=>true}),/Invalid package/);
});
test('release identity and each creator use one validation path, with per-title origin isolation',async()=>{
  for(const mutate of [c=>c.release.origin='https://shell.example',c=>c.release.origin='https://one.games.example/path',c=>c.release.digest='main',c=>c.metadata.notices[0].url='javascript:alert(1)',c=>c.manifest.input.touch=false]){
    const c=candidate();mutate(c);await assert.rejects(createPublishedCatalog([c],{shellOrigin:'https://shell.example',verifyPublication:()=>true}));
  }
  const a=candidate(),b=candidate();b.manifest.id='other-title';await assert.rejects(createPublishedCatalog([a,b],{verifyPublication:()=>true}),/origin/);
  for(const creator of ['Backbone','Independent developer','Community']){const c=candidate();c.metadata.creator=creator;assert.equal((await createPublishedCatalog([c])).entries.length,0);}
});
test('production registry is empty and cannot be switched to demo by data',()=>{
  const prod=JSON.parse(readFileSync('platform/catalog/catalog.json'));assert.deepEqual(validateCatalog(prod).entries,[]);
  const c=candidate();c.release.origin='http://127.0.0.1:12345';assert.throws(()=>validateCatalog(registry(c)));
  assert.throws(()=>validateCatalog({...registry(c),mode:'demo'}));
  assert.equal(validateCatalog({...registry(c),mode:'demo'},{mode:'demo'}).entries.length,1);
});
test('deep links, category/search/controller filters and immutable runtime URLs are stable',()=>{
  assert.deepEqual(routeFor('/g/2048/'),{view:'detail',id:'2048'});for(const path of ['/g/../x','/g/foo/entry.html','/g/%2f','/g/'+ 'a'.repeat(65)])assert.equal(routeFor(path).view,'not-found');
  const c=candidate();assert.equal(filterEntries([c],{query:'not found'}).length,0);assert.equal(filterEntries([c],{category:'action'}).length,0);assert.equal(filterEntries([c],{controller:true,query:'contract'}).length,1);
  assert.equal(titleUrl(c),`https://one.games.example/releases/${'a'.repeat(64)}/index.html`);
});
test('telemetry allows only trusted bounded lifecycle fields, never title-supplied identifiers',()=>{
  const log=[],send=createShellTelemetry(e=>log.push(e));send({type:'playable',titleId:'one',durationMs:123});assert.equal(log.length,1);
  for(const e of [{type:'playable',titleId:'one',durationMs:-1},{type:'detailView',titleId:'one',accountId:'secret'},{type:'launchFailed',titleId:'one',code:'arbitrary game text'},{type:'customEvent'}])assert.throws(()=>send(e));
});
function setup(){let at=0;const messages=[],events=[],frame={postMessage:(...v)=>messages.push(v)},origin='https://one.games.example',nonce='a'.repeat(32);const channel=createRuntimeChannel({frame,origin,nonce,onEvent:e=>events.push(e),now:()=>at});const event=(type,payload,sequence=0)=>({source:frame,origin,data:{protocol:'akeru.catalog.v1',nonce,sequence,type,payload}});return {channel,messages,events,frame,origin,event,setTime:v=>{at=v;}};}
test('runtime authentication rejects wrong window/origin/nonce, replay, extra fields and arbitrary requests',()=>{
 const s=setup();try{for(const patch of [{source:{}},{origin:'https://other.example'},{data:{...s.event('playable',{sdkVersion:'0.1.0'}).data,nonce:'b'.repeat(32)}},{data:{...s.event('playable',{sdkVersion:'0.1.0'}).data,credentials:'no'}}])assert.equal(s.channel.receive({...s.event('playable',{sdkVersion:'0.1.0'}),...patch}),false);
 assert.equal(s.channel.receive(s.event('navigate',{url:'https://bad.example'})),false);assert.equal(s.channel.receive(s.event('save.read',{userId:'other'})),false);
 assert.equal(s.channel.receive(s.event('playable',{sdkVersion:'0.1.0'})),true);assert.equal(s.channel.receive(s.event('playable',{sdkVersion:'0.1.0'})),false);assert.equal(s.events.length,1);
 }finally{s.channel.dispose();}
});
test('channel bounds loading traffic, initialization, input and lifecycle cleanup',()=>{
 const s=setup();try{s.channel.connect();s.channel.connect();assert.equal(s.messages.length,1);
 for(let i=0;i<60;i++)assert.equal(s.channel.receive(s.event('loading',{progress:.2},i)),true);assert.equal(s.channel.receive(s.event('playable',{sdkVersion:'0.1.0'},60)),false);s.setTime(1001);assert.equal(s.channel.receive(s.event('playable',{sdkVersion:'0.1.0'},61)),true);
 const input={sequence:0,timeMs:0,provider:'touch',connected:true,buttons:{confirm:1},axes:{moveX:.3}};
 for(const patch of [{timeMs:-.5},{sequence:-1},{axes:{moveX:Infinity}},{connected:false},{provider:'keyboard'},{account:'x'}])assert.equal(s.channel.sendInput({...input,...patch}),false);
 assert.equal(s.channel.sendInput(input),true);assert.equal(s.channel.sendInput(input),false);assert.equal(s.channel.pause(),true);assert.equal(s.channel.sendInput({...input,sequence:1}),false);assert.equal(s.channel.resume(),true);s.channel.dispose();assert.equal(s.channel.receive(s.event('exit',{},62)),false);assert.equal(s.channel.sendInput({...input,sequence:2}),false);
 }finally{s.channel.dispose();}
});
test('a missing playable handshake produces a timeout and closes the session',async()=>{
 const events=[],c=createRuntimeChannel({frame:{postMessage(){}},origin:'https://one.example',nonce:'a'.repeat(32),timeoutMs:100,onEvent:e=>events.push(e)});
 await new Promise(r=>setTimeout(r,130));assert.deepEqual(events,[{type:'error',code:'timeout'}]);assert.equal(c.state,'closed');
});
