// A DeviceStore over a Map, for tests that need a store and not a medium.

import type { DeviceRecord, DeviceStore } from "../device-store";

export function memoryDeviceStore(): DeviceStore & { readonly records: Map<DeviceRecord, string> } {
  const records = new Map<DeviceRecord, string>();
  return {
    records,
    read: async (record) => records.get(record) ?? null,
    write: async (record, text) => void records.set(record, text),
    remove: async (record) => void records.delete(record),
  };
}
