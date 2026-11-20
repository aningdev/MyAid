// The Storage store over a Map. (A headless nsh test has no real medium; tests/e2e
// runs the same store through the Carrier.)

import { expect, test } from "nsh/test";

import { storageDeviceStore } from "./device-store";

test("the store keeps each record under its own key", async () => {
  const values = new Map<string, string>();
  const store = storageDeviceStore({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
    removeItem: async (key) => void values.delete(key),
  });

  expect(await store.read("identity")).toBeNull();
  await store.write("identity", "key");
  await store.write("pairing", "link");
  expect([...values.keys()].sort()).toEqual(["dsh-bot.device.identity", "dsh-bot.device.pairing"]);
  expect(await store.read("pairing")).toBe("link");

  await store.remove("pairing");
  expect(await store.read("pairing")).toBeNull();
  expect(await store.read("identity")).toBe("key");
});
