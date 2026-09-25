export type SessionErrorCode =
  'invalid' | 'disposed' | 'busy' | 'unavailable' | 'stale' | 'unauthenticated';
export class SessionError extends Error {
  readonly code: SessionErrorCode;
  constructor(code: SessionErrorCode);
}
export type SessionSnapshot =
  | Readonly<{
      status:
        | 'unknown'
        | 'checking'
        | 'guest'
        | 'expired'
        | 'signing-out'
        | 'unavailable'
        | 'disposed';
    }>
  | Readonly<{ status: 'authenticated'; partition: string; expiresAt: number }>;
export interface SessionLease {
  /** Host-only opaque cache partition. Never an authorization credential. */
  readonly partition: string;
  readonly signal: AbortSignal;
  /** Recheck before accepting results or committing account-local work. */
  isCurrent(): boolean;
}
export interface SessionClient {
  snapshot(): SessionSnapshot;
  refresh(): Promise<SessionSnapshot>;
  lease(): SessionLease;
  logout(): Promise<SessionSnapshot>;
  dispose(): void;
}
export function createSessionClient(options: {
  /** Exact trusted HTTPS shell origin, without trailing slash. */
  origin: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): SessionClient;
