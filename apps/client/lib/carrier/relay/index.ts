// The relay Carrier's public Interface: what the Client's connection layer and
// the end-to-end tests import. Everything else in this directory is private.

export { createRelayCarrier, type RelayCarrier, type RelaySocket } from "./carrier";
export { RelayError, type RelayErrorCode } from "./errors";
export {
  clearPairing,
  loadDeviceIdentity,
  loadPairing,
  pairDevice,
  type DeviceIdentity,
  type Pairing,
  type StorageLike,
} from "./pairing";
export { openTunnel, type Tunnel } from "./tunnel";
