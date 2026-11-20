/** `uqr` returns a square module matrix, quiet zone included. */
import { expect, test } from "nsh/test";

import { qrModules } from "./qr";

test("a pairing link encodes to a square of modules", () => {
  const modules = qrModules("https://relay.example/pair#v=1");
  expect(modules.length).toBeGreaterThan(20);
  expect(modules.every((row) => row.length === modules.length)).toBe(true);
  expect(modules[0]?.every((cell) => cell === false)).toBe(true);
});
