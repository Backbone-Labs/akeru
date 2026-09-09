const MAX_RESPONSE_BYTES = 4096;
const opaque = /^[A-Za-z0-9_-]{32,128}$/u;

export class SessionError extends Error {
  constructor(code) {
    super(`Session ${code}.`);
    this.name = 'SessionError';
    this.code = code;
  }
}

// This module belongs to the trusted shell. Never pass it to a title frame.
export function createSessionClient({
  origin,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = 10000,
}) {
  let base;
  try {
    base = new URL(origin);
  } catch {
    throw new SessionError('invalid');
  }
  if (
    base.protocol !== 'https:' ||
    base.origin !== origin ||
    base.username ||
    base.password ||
    typeof fetcher !== 'function' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  ) {
    throw new SessionError('invalid');
  }
  let state = Object.freeze({ status: 'unknown' });
  let generation = 0;
  let controller = new AbortController();
  let expiryTimer;
  let csrfToken;
  let disposed = false;
  let loggingOut = false;

  function invalidate(status) {
    generation += 1;
    controller.abort();
    controller = new AbortController();
    clearTimeout(expiryTimer);
    csrfToken = undefined;
    state = Object.freeze({ status });
    return generation;
  }

  function expire() {
    if (state.status !== 'authenticated') return;
    clearTimeout(expiryTimer);
    if (state.expiresAt <= Date.now()) invalidate('expired');
    else {
      expiryTimer = setTimeout(
        expire,
        Math.min(state.expiresAt - Date.now(), 2147483647),
      );
      expiryTimer.unref?.();
    }
  }

  function assertLive() {
    if (disposed) throw new SessionError('disposed');
    if (loggingOut) throw new SessionError('busy');
  }

  async function request(path, method, signal, token) {
    const timed = new AbortController();
    const abort = () => timed.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) timed.abort();
    const timer = setTimeout(abort, timeoutMs);
    let reader;
    try {
      const response = await fetcher(new URL(path, base).href, {
        method,
        credentials: 'same-origin',
        mode: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/json',
          ...(token ? { 'X-Akeru-CSRF': token } : {}),
        },
        signal: timed.signal,
      });
      if (
        timed.signal.aborted ||
        response.status !== 200 ||
        response.redirected ||
        response.headers.get('content-type')?.split(';')[0].trim() !==
          'application/json' ||
        !response.body
      )
        throw new SessionError('unavailable');
      reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (timed.signal.aborted) throw new SessionError('unavailable');
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) throw new SessionError('unavailable');
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      // Provider responses, tokens and fetch exception messages must not escape.
      throw new SessionError('unavailable');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (reader) {
        try {
          await reader.cancel();
        } catch {
          /* Transport already closed. */
        }
      }
    }
  }

  function accept(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new SessionError('unavailable');
    const keys = Object.keys(payload).sort().join(',');
    if (payload.status === 'guest' && keys === 'status') {
      state = Object.freeze({ status: 'guest' });
    } else if (
      payload.status === 'authenticated' &&
      keys === 'csrfToken,expiresAt,partition,status' &&
      typeof payload.partition === 'string' &&
      opaque.test(payload.partition) &&
      typeof payload.csrfToken === 'string' &&
      opaque.test(payload.csrfToken) &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.expiresAt > Date.now()
    ) {
      csrfToken = payload.csrfToken;
      state = Object.freeze({
        status: 'authenticated',
        partition: payload.partition,
        expiresAt: payload.expiresAt,
      });
      expire();
    } else throw new SessionError('unavailable');
    return state;
  }

  return Object.freeze({
    snapshot() {
      expire();
      return state;
    },
    async refresh() {
      assertLive();
      const current = invalidate('checking');
      try {
        const payload = await request(
          '/api/akeru/session',
          'GET',
          controller.signal,
        );
        if (current !== generation) throw new SessionError('stale');
        return accept(payload);
      } catch (error) {
        if (current !== generation) throw new SessionError('stale');
        invalidate('unavailable');
        throw error;
      }
    },
    lease() {
      assertLive();
      expire();
      if (state.status !== 'authenticated')
        throw new SessionError('unauthenticated');
      const current = generation;
      const { partition, expiresAt } = state;
      const signal = controller.signal;
      return Object.freeze({
        partition,
        signal,
        isCurrent() {
          expire();
          return (
            !disposed &&
            current === generation &&
            !signal.aborted &&
            Date.now() < expiresAt
          );
        },
      });
    },
    async logout() {
      assertLive();
      expire();
      if (state.status !== 'authenticated')
        throw new SessionError('unauthenticated');
      const token = csrfToken;
      const current = invalidate('signing-out');
      loggingOut = true;
      try {
        const payload = await request(
          '/api/akeru/logout',
          'POST',
          controller.signal,
          token,
        );
        if (current !== generation) throw new SessionError('stale');
        if (
          !payload ||
          Object.keys(payload).join(',') !== 'status' ||
          payload.status !== 'guest'
        )
          throw new SessionError('unavailable');
        return accept(payload);
      } catch (error) {
        if (current !== generation) throw new SessionError('stale');
        invalidate('unavailable');
        throw error;
      } finally {
        loggingOut = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate('disposed');
    },
  });
}
