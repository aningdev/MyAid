// The relay Carrier's public Interface: what the Client's connection layer and
// the end-to-end tests import. Everything else in this directory is private.

export { createRelayCarrier, type RelayCarrier, type RelaySocket } from "./carrier";
export { RelayError, type RelayErrorCode } from "./errors";
export {
  clearPairing,
  loadDeviceIdentity,
  loadPairing,
  pairDevice,
  savePairing,
  type DeviceIdentity,
  type Pairing,
} from "./pairing";
export {
  fileDeviceStore,
  storageDeviceStore,
  type DeviceStore,
  type KeyValueStorage,
} from "./device-store";
export { openTunnel, type Tunnel } from "./tunnel";
