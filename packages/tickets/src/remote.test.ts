import { describe, expect, it } from "vite-plus/test";

import { TYPERT_REMOTE } from "./remote.ts";
import { TicketsService } from "./service.ts";

/** Parameter names as the gateway reads them from the method's JavaScript signature. */
function signature(method: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(method);
  const list = source.slice(source.indexOf("(") + 1, source.indexOf(")"));
  return list
    .split(",")
    .map((part) => part.trim().split(/[\s:=?]/)[0] ?? "")
    .filter(Boolean);
}

// The Host serves `TicketsService` through a weak descriptor built from its method
// signatures; the Client calls through `TYPERT_REMOTE`. A name that differs is
// rejected by the gateway as `gateway/arguments-invalid`.
describe("tickets Remote contract", () => {
  for (const [endpoint, definition] of Object.entries(TYPERT_REMOTE.methods)) {
    it(`${endpoint} takes the arguments TicketsService reads`, () => {
      const name = endpoint.slice(endpoint.indexOf("/") + 1);
      const method = (TicketsService.prototype as unknown as Record<string, unknown>)[name];
      expect(typeof method).toBe("function");
      const wires = definition.parameters.map((parameter) => parameter.wire);
      const cancellation = definition.cancellation?.parameter;
      const expected = cancellation ? [...wires, cancellation] : wires;
      expect(signature(method as (...args: never[]) => unknown)).toEqual(expected);
    });
  }
});
