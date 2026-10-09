/** Source-grounded feasibility only. There is deliberately no playable factory. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createContainedFileReader } from '../../scripts/read-contained-file.mjs';
export const feasibility = Object.freeze({
  title: 'Hypersomnia',
  status: 'feasibility-only',
  playable: false,
  publicationApproval: 'pending',
  revision: 'e4dd2c8f87358cb83cfdef5b352093379907147c',
  offlineCandidate:
    'Built-in tutorial and shooting range in test_scene_setup; no isolated browser build has been verified.',
  blockers: [
    'Web CMake explicitly forces BUILD_NETWORKING and BUILD_WEBRTC ON, overriding the OFF options.',
    'Web bootstrap owns IDBFS /user saves and passes authentication data to C++; replace with scoped host interfaces.',
    'Web bootstrap includes geolocation, OAuth, remote avatars and optional ad SDK hooks; remove these from the offline title.',
    'Eleven pinned gitlinks require independent source and notice inventories before selecting runtime dependencies.',
    'Native introspector/version generators and generated content cache are required before WASM compilation.',
    'Upstream release web profile requests 1200 MB initial memory plus a 4 MB stack; mobile feasibility requires measurement and reduction.',
    'Controller/touch mapping, local lifecycle, host saves, and isolated offline browser QA remain unimplemented.',
    'Public multiplayer needs a separately approved service, privacy, abuse-reporting and moderation design.',
  ],
});
export function assessSource(source) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const inventory = JSON.parse(
    readFileSync(
      resolve(root, 'compliance/source-inventories/hypersomnia.json'),
    ),
  );
  if (
    execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim() !== feasibility.revision
  )
    throw new Error('Wrong Hypersomnia revision');
  const reader = createContainedFileReader(source);
  const paths = [
    'CMakeLists.txt',
    '.gitmodules',
    'cmake/web/assets/common.js',
    'cmake/web/web_shell_cg.html',
    'src/application/setups/test_scene_setup.cpp',
    'src/application/setups/test_scene_setup.h',
  ];
  const evidence = paths.map((path) => {
    const file = inventory.files.find((f) => f.path === path),
      bytes = reader.read(path);
    const hash = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    if (!file || hash !== file.gitObjectId)
      throw new Error('Source inventory mismatch: ' + path);
    return {
      path,
      gitObjectId: hash,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  return {
    ...feasibility,
    evidence,
    submodules: inventory.files
      .filter((f) => f.mode === '160000')
      .map(({ path, gitObjectId }) => ({
        path,
        revision: gitObjectId,
        rightsStatus: 'unknown',
      })),
    buildStatus: 'not attempted; integration and dependency gates remain open',
    servicesStarted: [],
    externalRuntimeRequests: [],
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.HYPERSOMNIA_SOURCE)
    throw new Error('Set HYPERSOMNIA_SOURCE to the pinned checkout');
  const report = assessSource(process.env.HYPERSOMNIA_SOURCE),
    out = new URL('../../dist/hypersomnia-feasibility/', import.meta.url);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    new URL('report.json', out),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: report.status,
      playable: report.playable,
      evidenceFiles: report.evidence.length,
      submodules: report.submodules.length,
    }),
  );
}
