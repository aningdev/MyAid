// Where the Device's two records live: its static key (identity) and its one
// pairing. A store holds each record as text, so parsing and validation stay in
// `pairing.ts`. The product keeps them in nsh Storage on every target (0010);
// tests use a store over a Map.

/** The two records a Device keeps. */
export type DeviceRecord = "identity" | "pairing";

/** Reads, writes and removes the Device's records as text. */
export interface DeviceStore {
  /** The record's text; `null` when the Device has none. */
  read(record: DeviceRecord): Promise<string | null>;
  /** Replaces the record whole; a reader never sees half of it. */
  write(record: DeviceRecord, text: string): Promise<void>;
  /** Forgets the record; removing one that is not there is not an error. */
  remove(record: DeviceRecord): Promise<void>;
}

/** The part of nsh Storage the Storage-backed store uses. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const STORAGE_KEYS: Record<DeviceRecord, string> = {
  identity: "dsh-bot.device.identity",
  pairing: "dsh-bot.device.pairing",
};

/** The product store: nsh Storage, one key per record. */
export function storageDeviceStore(storage: KeyValueStorage): DeviceStore {
  return {
    read: (record) => storage.getItem(STORAGE_KEYS[record]),
    write: (record, text) => storage.setItem(STORAGE_KEYS[record], text),
    remove: (record) => storage.removeItem(STORAGE_KEYS[record]),
  };
}
