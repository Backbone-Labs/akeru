import type { AudioState, HostServicesV1, InputMapping, PresentationState, RawInputSnapshot, SaveRecord, TitleAdapterV1 } from './index.js';

export interface LaunchPlan {
  readonly renderer: 'dom' | 'canvas2d' | 'webgl2' | 'webgpu';
  readonly sdkVersion: string;
  readonly titleOrigin: string;
  readonly sandbox: 'allow-scripts allow-same-origin';
  readonly headers: Readonly<Record<string, string>>;
}

export function planLaunch(manifest: unknown, environment: {
  grants: readonly string[];
  graphics: readonly ('dom' | 'canvas2d' | 'webgl2' | 'webgpu')[];
  features: readonly string[];
  shellOrigin: string;
  titleOrigin: string;
  sdkVersion?: string;
}): LaunchPlan;

export interface ReferenceHost {
  readonly services: HostServicesV1;
  readonly state: string;
  readonly events: readonly unknown[];
  readonly listenerCount: number;
  deliverInput(input: {
    sequence: number;
    timeMs: number;
    provider: 'gamepad' | 'touch' | 'native-input';
    connected: boolean;
    buttons: Readonly<Record<string, number>>;
    axes: Readonly<Record<string, number>>;
  }): void;
  deliverRawInput(input: RawInputSnapshot): void;
  /** Losing focus and remapping emit an empty-control snapshot to release held state. */
  setInputFocus(focused: boolean, timeMs?: number): void;
  remapInput(mapping: InputMapping, timeMs?: number): void;
  updatePresentation(state: PresentationState): void;
  updateAudio(state: AudioState): void;
  updateSaveStatus(state: { local: 'available' | 'unavailable'; sync: 'disabled' | 'signed-out' | 'pending' | 'synced' | 'conflict' | 'error' }): void;
  /** Host control-plane operations. These are intentionally absent from HostServicesV1. */
  exportSaves(): { schemaVersion: number; records: Array<{ slot: string; schemaVersion: number; bytes: Uint8Array }> };
  resetSaves(): void;
  migrateSaves(migrate: (slot: string, record: SaveRecord, targetSchemaVersion: number) => Promise<{ schemaVersion: number; bytes: Uint8Array }>): Promise<void>;
  dispose(): void;
}

export function createReferenceHost(options?: {
  schemaVersion?: number;
  maxBytes?: number;
  maxSlots?: number;
  inputDeadzone?: number;
  inputMapping?: InputMapping;
  initialSaves?: Array<{ slot: string; schemaVersion: number; bytes: Uint8Array }>;
}): ReferenceHost;

export function assertTitleAdapterV1(adapter: unknown): TitleAdapterV1;
