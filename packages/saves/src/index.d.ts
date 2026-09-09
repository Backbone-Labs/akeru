import type { SaveRecord, SaveService, SaveStatus } from '@akeru/contracts';

export type SaveErrorCode =
  'conflict' | 'invalid' | 'unavailable' | 'quota' | 'corrupt' | 'migration';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(code: SaveErrorCode, message: string, options?: ErrorOptions);
}

export interface ListedSaveRecord extends SaveRecord {
  slot: string;
}

export interface SaveExport {
  format: 'akeru-guest-saves';
  version: 1;
  titleId: string;
  schemaVersion: number;
  records: Array<{
    slot: string;
    schemaVersion: number;
    revision: string;
    /** Base64-encoded bytes. */
    bytes: string;
  }>;
}

export interface TitleSaveStore extends SaveService {
  /** Narrow game-facing facade. It never exposes host administration methods. */
  readonly service: SaveService;
  list(): Promise<ListedSaveRecord[]>;
  exportData(): Promise<SaveExport>;
  reset(): Promise<void>;
  migrate(
    slot: string,
    expectedRevision: string,
    migrateFn: (
      record: SaveRecord,
    ) =>
      | { schemaVersion: number; bytes: Uint8Array }
      | Promise<{ schemaVersion: number; bytes: Uint8Array }>,
  ): Promise<SaveRecord>;
}

export interface SaveStore {
  forTitle(options: {
    titleId: string;
    schemaVersion: number;
    maxSlots?: number;
    maxBytesPerSlot?: number;
  }): TitleSaveStore;
}

export function createSaveStore(options?: {
  indexedDB?: IDBFactory;
  databaseName?: string;
}): SaveStore;

export type { SaveRecord, SaveService, SaveStatus };
