/** The title's end of `akeru.catalog.v1`: who launched this frame, and which
 * messages are really from them. Kept free of page globals so each check can
 * be tested alone. */
export const PROTOCOL = 'akeru.catalog.v1';

/** The shell origin and session nonce the host put in the frame's URL, or
 * null when the page was opened some other way. */
export function launchArgs(hash) {
  const args = new URLSearchParams(String(hash).replace(/^#/, ''));
  const shell = args.get('shell'),
    nonce = args.get('nonce');
  try {
    if (
      new URL(shell).origin !== shell ||
      !/^[-a-zA-Z0-9]{32,128}$/.test(nonce)
    )
      return null;
  } catch {
    return null;
  }
  return { shell, nonce };
}

/** Accept a message only from the launching window, at its origin, with this
 * session's nonce and a sequence number that has not been seen. */
export function createGate({ source, shell, nonce }) {
  let received = -1;
  return (event) => {
    const message = event?.data;
    if (
      event.source !== source ||
      event.origin !== shell ||
      !message ||
      typeof message !== 'object' ||
      message.protocol !== PROTOCOL ||
      message.nonce !== nonce ||
      typeof message.type !== 'string' ||
      !Number.isSafeInteger(message.sequence) ||
      message.sequence <= received
    )
      return null;
    received = message.sequence;
    return { type: message.type, payload: message.payload };
  };
}
