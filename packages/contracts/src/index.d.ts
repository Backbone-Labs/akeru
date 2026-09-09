/** Draft v0.1 contracts. Implementations must validate every cross-origin message. */
export const SPEC_VERSION: '0.1.0';
export const SDK_VERSION: '0.1.0';
export interface ValidationResult { valid: boolean; errors: string[] }
export function validateManifest(manifest: unknown, options?: { sdkVersion?: string }): ValidationResult;
export function validatePackage(directory: string, options?: { sdkVersion?: string }): Promise<ValidationResult>;

export type LifecycleEvent =
  | { type: 'loading'; progress?: number }
  | { type: 'playable' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'exit' }
  | { type: 'fatal'; code: string; message: string }
  | { type: 'roundEnd'; result?: 'completed' | 'failed' };
export interface InputSnapshot {
  /** Sequence increases within a session; time is monotonic, never wall-clock. */
  sequence: number;
  timeMs: number;
  provider: 'gamepad' | 'touch' | 'native-input';
  connected: boolean;
  /** Normalized logical buttons [0,1] and axes [-1,1], after host remapping. */
  buttons: Readonly<Record<string, number>>;
  axes: Readonly<Record<string, number>>;
}
export interface SaveRecord { schemaVersion: number; revision: string; bytes: Uint8Array }
export interface SaveService {
  /** Host binds title and player/session identity. Games cannot select either. */
  read(slot: string): Promise<SaveRecord | null>;
  /** Compare-and-swap: null means create only. A conflict never silently overwrites. */
  write(slot: string, value: { schemaVersion: number; bytes: Uint8Array }, expectedRevision: string | null): Promise<SaveRecord>;
  remove(slot: string, expectedRevision: string): Promise<void>;
  status(): Promise<{ local: 'available' | 'unavailable'; sync: 'disabled' | 'signed-out' | 'pending' | 'synced' | 'conflict' | 'error' }>;
}
export interface HostServicesV1 {
  sdkVersion: '0.1.0';
  saves: SaveService;
  /** Host may deny; requests never authorize navigation or native UI. */
  presentation: { request(mode: 'embedded' | 'fullscreen'): Promise<{ mode: 'embedded' | 'fullscreen'; granted: boolean }> };
  /** Fixed numeric metrics only; host applies consent and export policy. */
  telemetry: { emit(event: { type: 'loadDurationMs' | 'frameDurationMs'; value: number }): void };
  emit(event: LifecycleEvent): void;
  onInput(listener: (input: InputSnapshot) => void): () => void;
}
export interface TitleAdapterV1 {
  initialize(host: HostServicesV1): Promise<void>;
  pause(reason: 'background' | 'overlay' | 'user'): Promise<void>;
  resume(): Promise<void>;
  /** Idempotent; removes input listeners, stops audio/rendering and releases resources. */
  dispose(): Promise<void>;
}
