/** Draft v0.1 contracts. Implementations must validate every cross-origin message. */
export const SPEC_VERSION: '0.1.0';
export const SDK_VERSION: '0.1.0';
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
export function validateManifest(
  manifest: unknown,
  options?: { sdkVersion?: string },
): ValidationResult;
export function validatePackage(
  directory: string,
  options?: { sdkVersion?: string },
): Promise<ValidationResult>;

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
export interface RawInputSnapshot {
  /** Monotonic provider timestamp. The host owns the sequence delivered to games. */
  timeMs: number;
  provider: 'gamepad' | 'touch' | 'native-input';
  connected: boolean;
  buttons: Readonly<Record<string, number>>;
  axes: Readonly<Record<string, number>>;
}
export interface InputMapping {
  /** Physical/provider control name to logical game control name. Unmapped controls are dropped. */
  buttons: Readonly<Record<string, string>>;
  axes: Readonly<Record<string, string>>;
}
export interface SaveRecord {
  schemaVersion: number;
  revision: string;
  bytes: Uint8Array;
}
export interface SaveStatus {
  local: 'available' | 'unavailable';
  sync: 'disabled' | 'signed-out' | 'pending' | 'synced' | 'conflict' | 'error';
  quota: {
    usedSlots: number;
    maxSlots: number;
    usedBytes: number;
    maxBytesPerSlot: number;
  };
}
export interface SaveService {
  /** Host binds title and player/session identity. Games cannot select either. */
  read(slot: string): Promise<SaveRecord | null>;
  /** Compare-and-swap: null means create only. A conflict never silently overwrites. */
  write(
    slot: string,
    value: { schemaVersion: number; bytes: Uint8Array },
    expectedRevision: string | null,
  ): Promise<SaveRecord>;
  remove(slot: string, expectedRevision: string): Promise<void>;
  status(): Promise<SaveStatus>;
}
export interface PresentationState {
  mode: 'embedded' | 'fullscreen';
  orientation: 'portrait' | 'landscape';
  safeArea: { top: number; right: number; bottom: number; left: number };
}
export interface AudioState {
  state: 'blocked' | 'ready' | 'interrupted';
  reason: 'consent-required' | 'background' | 'route-change' | null;
}
export interface ControlHelpItem {
  action: string;
  label: string;
}
export interface ControlHelp {
  controller: readonly ControlHelpItem[];
  touch: readonly ControlHelpItem[];
}
export interface HostServicesV1 {
  sdkVersion: '0.1.0';
  saves: SaveService;
  /** Host may deny; requests never authorize navigation or native UI. */
  presentation: {
    getState(): PresentationState;
    onChange(listener: (state: PresentationState) => void): () => void;
    request(
      mode: 'embedded' | 'fullscreen',
    ): Promise<{ mode: 'embedded' | 'fullscreen'; granted: boolean }>;
  };
  /** Playback remains host-gated. A request may surface consent UI but cannot grant itself. */
  audio: {
    getState(): AudioState;
    onChange(listener: (state: AudioState) => void): () => void;
    requestPlayback(): Promise<{ granted: boolean; state: AudioState }>;
  };
  /** Fixed numeric metrics only; host applies consent and export policy. */
  telemetry: {
    emit(event: {
      type: 'loadDurationMs' | 'frameDurationMs';
      value: number;
    }): void;
  };
  emit(event: LifecycleEvent): void;
  onInput(listener: (input: InputSnapshot) => void): () => void;
}
export interface TitleAdapterV1 {
  /** Text-only metadata rendered by the host; both required input paths must be documented. */
  readonly controlHelp: ControlHelp;
  initialize(host: HostServicesV1): Promise<void>;
  pause(reason: 'background' | 'overlay' | 'user'): Promise<void>;
  resume(): Promise<void>;
  /** Idempotent; removes input listeners, stops audio/rendering and releases resources. */
  dispose(): Promise<void>;
}

/** Runtime shape check for JavaScript adapters; returns the same adapter on success. */
export function assertTitleAdapterV1(adapter: unknown): TitleAdapterV1;
