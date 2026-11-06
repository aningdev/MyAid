/**
 * Relay unit Background Service registration via RelayControl (native adapter).
 */
import { RelayControl } from "myaid/native";

import {
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  type RegistrationSnapshot,
  type UnitRegistration,
} from "../background/protocol";

export type RelayRegistrationOp =
  | "registrationQuery"
  | "registrationEnable"
  | "registrationStop";

export type RelayRegistrationTransport = {
  reachable(): Promise<boolean>;
  call(op: RelayRegistrationOp): Promise<string>;
};

const nativeTransport: RelayRegistrationTransport = {
  reachable: () => RelayControl.reachable(),
  call: (op) => RelayControl.request(op),
};

let transport: RelayRegistrationTransport = nativeTransport;

export function setRelayRegistrationTransport(next: RelayRegistrationTransport | null): void {
  transport = next ?? nativeTransport;
}

export const relayRegistrationAccess = {
  reachable: () => transport.reachable(),

  registrationQuery: async (): Promise<RegistrationSnapshot> =>
    decodeRegistrationSnapshot(await transport.call("registrationQuery")),

  registrationEnable: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationEnable")),

  registrationStop: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationStop")),
};
