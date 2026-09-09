/** Executable contract model, not a browser sandbox or production persistence. */
import { validateManifest, SDK_VERSION } from './index.js';

const fail = (message) => {
  throw new Error(message);
};
/** Trusted host calls this with immutable registry identity and detected capabilities. */
export function planLaunch(
  manifest,
  {
    grants,
    graphics,
    features,
    shellOrigin,
    titleOrigin,
    sdkVersion = SDK_VERSION,
  },
) {
  const result = validateManifest(manifest, { sdkVersion });
  if (!result.valid) fail(result.errors.join('; '));
  const origin = (value) => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value)
      fail('Expected a canonical HTTPS origin');
    return url.origin;
  };
  if (origin(shellOrigin) === origin(titleOrigin))
    fail('Title and shell must have different origins');
  if (manifest.capabilities.some((c) => !grants.includes(c)))
    fail('Missing host capability grant');
  if (manifest.runtime.requiredFeatures.some((f) => !features.includes(f)))
    fail('Missing runtime feature');
  const requested = manifest.runtime.graphics;
  const renderer = [requested.preferred, requested.fallback].find(
    (r) => r && graphics.includes(r),
  );
  if (!renderer) fail('Missing graphics capability');
  // Same-origin fetch permits reviewed WASM/data artifacts. The immutable title host must deny
  // undeclared paths, writes and redirects; CSP blocks external connections and resources.
  const csp =
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; frame-ancestors " +
    shellOrigin;
  if (manifest.runtime.requiredFeatures.includes('threads'))
    fail(
      'Threaded runtime requires a separately verified worker/isolation policy',
    );
  return Object.freeze({
    renderer,
    sdkVersion,
    titleOrigin,
    sandbox: 'allow-scripts allow-same-origin',
    headers: Object.freeze({
      'Content-Security-Policy': csp,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
    }),
  });
}

export {
  assertTitleAdapterV1,
  createReferenceHost,
} from './reference-session.js';
