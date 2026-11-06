/**
 * Host unit Background Service registration via HostControl (native adapter).
 */
import { HostControl } from "myaid/native";

import {
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  type RegistrationSnapshot,
  type UnitRegistration,
} from "../background/protocol";

export type HostRegistrationOp =
  | "registrationQuery"
  | "registrationEnable"
  | "registrationStop";

export type HostRegistrationTransport = {
  reachable(): Promise<boolean>;
  call(op: HostRegistrationOp): Promise<string>;
};

const nativeTransport: HostRegistrationTransport = {
  reachable: () => HostControl.reachable(),
  call: (op) => HostControl.request(op, ""),
};

let transport: HostRegistrationTransport = nativeTransport;

export function setHostRegistrationTransport(next: HostRegistrationTransport | null): void {
  transport = next ?? nativeTransport;
}

export const hostRegistrationAccess = {
  reachable: () => transport.reachable(),

  registrationQuery: async (): Promise<RegistrationSnapshot> =>
    decodeRegistrationSnapshot(await transport.call("registrationQuery")),

  registrationEnable: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationEnable")),

  registrationStop: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationStop")),
};
