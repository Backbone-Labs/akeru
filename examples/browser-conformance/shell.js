const config = JSON.parse(document.getElementById('config').textContent);
const received = new Map();
let invalidRejected = 0;
addEventListener('message', (event) => {
  const expected = config.titles.find(
    (t) =>
      t.origin === event.origin &&
      document.getElementById(t.name).contentWindow === event.source,
  );
  if (
    !expected ||
    event.data?.nonce !== expected.nonce ||
    event.data?.name !== expected.name ||
    event.data?.type !== 'result'
  ) {
    invalidRejected++;
    return;
  }
  received.set(expected.name, event.data);
});
// Correct-looking payload from the shell is not accepted as title authority.
postMessage(
  { type: 'result', name: 'a', nonce: config.titles[0].nonce },
  location.origin,
);
const poll = setInterval(async () => {
  if (received.size !== 2) return;
  clearInterval(poll);
  const results = [...received.values()];
  const collector = await fetch('/collector-count').then((r) => r.json());
  const passed =
    results.every(
      (r) =>
        r.adapterWorked &&
        r.inputWorked &&
        r.storageWorked &&
        r.presentationWorked &&
        r.presentationStateWorked &&
        r.audioWorked &&
        r.sameOriginWasmWorked &&
        r.artifactHostWorked &&
        r.telemetryWorked &&
        r.lifecycleWorked &&
        r.listenersReleased &&
        r.blockedFetch &&
        r.blockedDOM &&
        r.absent &&
        r.ownStorage &&
        ['connect-src', 'img-src', 'script-src-elem', 'frame-src'].every((d) =>
          r.violations.includes(d),
        ),
    ) &&
    invalidRejected > 0 &&
    collector.count === 0 &&
    !document.body.dataset.compromised;
  document.getElementById('result').textContent = JSON.stringify({
    passed,
    browser: navigator.userAgent,
    results,
    invalidRejected,
    collector,
  });
  document.body.dataset.finished = 'true';
}, 25);

setTimeout(() => {
  if (document.body.dataset.finished) return;
  clearInterval(poll);
  document.getElementById('result').textContent = JSON.stringify({
    passed: false,
    error: 'Fixture timed out',
    received: received.size,
  });
}, 10000);
