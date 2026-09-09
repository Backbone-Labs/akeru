import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const fail = message => { throw new Error(message); };
export function selectedPaths(group, inventory) {
  const selector = group.selector;
  if (!selector || (!!selector.paths === !!selector.prefix)) fail('Choose exact paths or one prefix');
  const paths = selector.paths ?? inventory.files.filter(f => f.path.startsWith(selector.prefix) && !selector.excludePaths?.includes(f.path)).map(f => f.path);
  if (!paths.length || new Set(paths).size !== paths.length) fail('Empty or duplicate group paths');
  return paths;
}

// Evidence is deliberately separate from publication and dossier approval.
export function validateRightsAudit(audit, inventory) {
  if (audit.schemaVersion !== 1 || audit.approvalStatus !== 'pending') fail('Source evidence cannot grant approval');
  if (audit.revision !== inventory.revision || audit.upstreamUrl !== inventory.upstreamUrl) fail('Source pin drift');
  const files = new Map(inventory.files.map(f => [f.path, f]));
  const evidence = new Map();
  for (const e of audit.evidence) {
    if (evidence.has(e.path) || files.get(e.path)?.gitObjectId !== e.gitObjectId) fail('Evidence object mismatch');
    const url = `${audit.upstreamUrl}${audit.upstreamUrl.startsWith('https://gitlab.com/') ? '/-/blob/' : '/blob/'}${audit.revision}/${e.path}`;
    if (e.url !== url || !/^[a-f0-9]{64}$/.test(e.sha256) || !Number.isInteger(e.bytes) || e.bytes <= 0 || !Number.isInteger(e.lineCount) || e.lineCount <= 0) fail('Invalid evidence identity');
    evidence.set(e.path, e);
  }
  const assigned = new Set(), ids = new Set();
  for (const group of audit.groups) {
    if (ids.has(group.id)) fail('Duplicate group');
    ids.add(group.id);
    const paths = selectedPaths(group, inventory);
    if (paths.length !== group.fileCount || !group.noticeAction?.trim()) fail('Group count or notice action missing');
    for (const path of paths) {
      if (!files.has(path) || assigned.has(path)) fail('Unknown or multiply assigned source path');
      const declaration = evidence.get(path)?.declaration;
      if (declaration?.scope === 'file' && !['file-declaration', 'conflicting-declarations'].includes(group.basis)) fail('File declarations cannot be downgraded to inherited claims');
      assigned.add(path);
    }
    const refs = group.evidence.map(p => evidence.get(p) ?? fail('Missing evidence reference'));
    if (!refs.length) fail('Evidence required');
    if (group.basis === 'file-declaration') {
      for (const path of paths) {
        if (!refs.some(e => e.path === path && e.declaration?.scope === 'file' && e.declaration.license === group.declaredLicense)) fail('A root license cannot stand in for a file declaration');
      }
    } else if (group.basis === 'inherited-project-claim') {
      if (!group.unknowns.length || !refs.some(e => e.declaration?.scope === 'repository' && e.declaration.license === group.declaredLicense)) fail('Inherited claims must retain their limitation and root evidence');
    } else if (group.basis === 'subtree-declaration') {
      if (!refs.some(e => e.declaration?.scope === 'subtree' && e.declaration.license === group.declaredLicense && paths.every(p => p.startsWith(e.path.slice(0, e.path.lastIndexOf('/') + 1))))) fail('Subtree declaration scope mismatch');
    } else if (['unknown', 'conflicting-declarations'].includes(group.basis)) {
      if (group.declaredLicense !== null || !group.unknowns.length) fail('Unknown rights cannot be silently resolved');
    } else fail('Unknown evidence basis');
  }
  if (assigned.size !== files.size) fail('Unmapped source paths');
  return { files: assigned.size, groups: ids.size, evidence: evidence.size };
}

export function verifyAuditSources(audit, sourceDirectory) {
  for (const e of audit.evidence) {
    const path = resolve(sourceDirectory, e.path);
    if (!path.startsWith(resolve(sourceDirectory) + '/')) fail('Unsafe evidence path');
    const bytes = readFileSync(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const gitObjectId = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (bytes.length !== e.bytes || sha256 !== e.sha256 || gitObjectId !== e.gitObjectId) fail(`Evidence bytes differ: ${e.path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, checkout] = process.argv.slice(2);
  if (!['anarch', 'freedm'].includes(name)) fail('Usage: node scripts/validate-rights-audit.mjs anarch|freedm [PINNED_SOURCE_DIRECTORY]');
  const audit = JSON.parse(readFileSync(`compliance/rights-audits/${name}.json`));
  const inventory = JSON.parse(readFileSync(`compliance/source-inventories/${audit.inventory}`));
  const result = validateRightsAudit(audit, inventory);
  if (checkout) verifyAuditSources(audit, checkout);
  console.log(JSON.stringify({ ...result, sourceBytesVerified: Boolean(checkout), approvalStatus: 'pending' }));
}
