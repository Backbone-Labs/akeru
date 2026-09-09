import type { InputMapping, InputSnapshot } from '@akeru/contracts';

export type NavigationEvent =
  | { readonly type: 'move'; readonly direction: 'up' | 'down' | 'left' | 'right' }
  | { readonly type: 'activate' | 'back' | 'menu' };
export interface InputPreferences {
  version: 1;
  deadzone: number;
  selectedController: number | null;
  mappings: { gamepad: InputMapping; touch: InputMapping };
}
export interface BrowserInputProvider {
  mount(roots: { touchRoot: HTMLElement; controlsRoot?: HTMLElement }): () => void;
  start(): void;
  stop(): void;
  subscribe(listener: (snapshot: InputSnapshot) => void): () => void;
  subscribeNavigation(listener: (event: NavigationEvent) => void): () => void;
  setDeadzone(value: number): void;
  setMapping(provider: 'gamepad' | 'touch', mapping: InputMapping): void;
  selectController(index: number | null): void;
  resetPreferences(): void;
  /** Refreshes the controller list without emitting input/navigation or selecting a device. */
  refreshControllers(): readonly Readonly<{ index: number; mapping: 'standard' }>[];
  getPreferences(): InputPreferences;
  getState(): Readonly<{ started: boolean; mounted: boolean; focused: boolean; gamepad: 'available' | 'unavailable'; activeProvider: 'gamepad' | 'touch' | null; activeController: number | null; controllers: readonly Readonly<{ index: number; mapping: 'standard' }>[] }>;
  showControls(): void;
  hideControls(): void;
  dispose(): void;
}
export function createBrowserInputProvider(options: {
  titleId: string;
  window?: Window;
  document?: Document;
  navigator?: Navigator;
  storage?: Storage | null;
  mapping?: Partial<{ gamepad: InputMapping; touch: InputMapping }>;
  deadzone?: number;
  selectedController?: number | null;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  now?: () => number;
  onError?: (error: unknown) => void;
}): BrowserInputProvider;
export const GAMEPAD_BUTTONS: readonly string[];
export const GAMEPAD_AXES: readonly string[];
export const LOGICAL_BUTTONS: readonly string[];
export const LOGICAL_AXES: readonly string[];
export const DEFAULT_MAPPINGS: Readonly<{ gamepad: InputMapping; touch: InputMapping }>;
export function applyDeadzone(value: number, deadzone: number): number;
export function normalizeRawControls(raw: { buttons: Record<string, number>; axes: Record<string, number> }, mapping: InputMapping, deadzone: number): { buttons: Record<string, number>; axes: Record<string, number> };
export function readStandardGamepad(gamepad: Gamepad): { buttons: Record<string, number>; axes: Record<string, number> } | null;
export function validateMapping(provider: 'gamepad' | 'touch', mapping: InputMapping): InputMapping;
export function preferenceKey(titleId: string): string;
export function defaultPreferences(): InputPreferences;
export function validatePreferences(value: unknown): InputPreferences;
export function loadPreferences(storage: Storage | null, titleId: string): InputPreferences;
export function savePreferences(storage: Storage | null, titleId: string, preferences: InputPreferences): InputPreferences;
