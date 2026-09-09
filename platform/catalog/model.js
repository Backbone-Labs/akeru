/** Browser-safe registry projection. Publication authority lives on the server. */
export const CATEGORIES = Object.freeze(['action','puzzle','strategy','sports','sandbox']);
const fail = message => { throw new Error(message); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const text = (v,max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const strings = (v,max=16) => Array.isArray(v) && v.length>0 && v.length<=max && v.every(s=>text(s,240));
export function publicUrl(value) {
  if (!text(value,2048)) return false;
  try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password; } catch {return false;}
}
export function validateMetadata(m) {
  if (!exact(m,['summary','description','category','creator','ageLabel','controls','privacy','notices']) || !text(m.summary,160) || !text(m.description,1600) || !CATEGORIES.includes(m.category) || !text(m.creator,100) || !text(m.ageLabel,160) || !exact(m.controls,['controller','touch']) || !strings(m.controls.controller) || !strings(m.controls.touch) || !strings(m.privacy) || !Array.isArray(m.notices) || !m.notices.length || m.notices.length>24 || m.notices.some(n=>!exact(n,['label','url']) || !text(n.label,100) || !publicUrl(n.url))) fail('Invalid catalog metadata');
  return m;
}
export function validateCatalog(value,{mode='production',shellOrigin}={}) {
  if (!exact(value,['schemaVersion','mode','entries']) || value.schemaVersion!=='0.1.0' || value.mode!==mode || !['production','demo'].includes(mode) || !Array.isArray(value.entries) || value.entries.length>500) fail('Invalid catalog');
  const ids=new Set(),origins=new Set();
  for(const entry of value.entries){
    if(!exact(entry,['manifest','release','metadata','availability']) || !['available','paused'].includes(entry.availability)) fail('Invalid catalog entry');
    const m=entry.manifest;
    if(!m || m.specVersion!=='0.1.0' || typeof m.id!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.id) || m.id.length>64 || ids.has(m.id) || !text(m.title,120) || !text(m.version,512) || !/^[A-Za-z0-9_-]+(?:[./][A-Za-z0-9_-]+)*$/.test(m.entry) || m.entry.split('/').some(p=>p==='.'||p==='..') || m.entry.length>240 || m.input?.controller!==true || m.input?.touch!==true || m.saves?.guestLocal!==true || !['disabled','optional'].includes(m.saves.accountSync) || !publicUrl(m.provenance?.source?.url) || !text(m.provenance.source.license,512) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(m.provenance.source.revision)) fail('Invalid manifest projection');
    if(!exact(entry.release,['digest','origin']) || !/^[a-f0-9]{64}$/.test(entry.release.digest)) fail('Invalid release');
    const u=new URL(entry.release.origin);
    const localDemo=mode==='demo' && u.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname);
    if((u.protocol!=='https:' && !localDemo) || u.origin!==entry.release.origin || u.origin===shellOrigin || origins.has(u.origin)) fail('Invalid isolated title origin');
    validateMetadata(entry.metadata);ids.add(m.id);origins.add(u.origin);
  }
  return structuredClone(value);
}
export function routeFor(pathname) {
  if(pathname==='/') return {view:'catalog'};
  const match=/^\/g\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(pathname);
  return match && match[1].length<=64 ? {view:'detail',id:match[1]} : {view:'not-found'};
}
export function titleUrl(entry) {return `${entry.release.origin}/releases/${entry.release.digest}/${entry.manifest.entry}`;}
export function filterEntries(entries,{category='all',controller=false,query=''}={}) {
  const search=query.trim().toLocaleLowerCase().slice(0,120);
  return entries.filter(e=>(category==='all'||e.metadata.category===category)&&(!controller||e.manifest.input.controller)&&(!search||`${e.manifest.title} ${e.metadata.summary}`.toLocaleLowerCase().includes(search)));
}
const EVENT_KEYS={catalogView:[],detailView:['titleId'],launchRequested:['titleId'],playable:['titleId','durationMs'],launchFailed:['titleId','code'],sessionExit:['titleId']};
/** Only trusted shell calls may reach the injected sink. Never forward title payloads. */
export function createShellTelemetry(sink=()=>{}) {
  return event=>{
    const fields=EVENT_KEYS[event?.type];if(!fields||!exact(event,['type',...fields])) fail('Invalid shell telemetry');
    if(fields.includes('titleId') && !/^[a-z0-9-]{1,64}$/.test(event.titleId)) fail('Invalid telemetry identity');
    if(fields.includes('durationMs') && (!Number.isFinite(event.durationMs)||event.durationMs<0||event.durationMs>600000)) fail('Invalid telemetry duration');
    if(fields.includes('code') && !['timeout','runtime','registry','unsupported'].includes(event.code)) fail('Invalid telemetry code');
    sink(Object.freeze({...event}));
  };
}
