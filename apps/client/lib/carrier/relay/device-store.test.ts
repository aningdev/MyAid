// The two stores behind the Device's records. The file store is driven over an
// in-memory filesystem here (a headless nsh test has none); tests/e2e runs the
// same store over a real directory.

import { expect, test } from "nsh/test";

import { fileDeviceStore, storageDeviceStore, type DeviceFs } from "./device-store";

class FakeFs implements DeviceFs {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  /** Every mutation, in order, so a test can see how a record was written. */
  readonly calls: string[] = [];

  async readFile(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw Object.assign(new Error("no such file"), { code: "ENOENT" });
    return text;
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.calls.push(`write ${path}`);
    this.files.set(path, data);
  }

  async mkdir(path: string): Promise<void> {
    this.calls.push(`mkdir ${path}`);
    this.directories.add(path);
  }

  async rename(from: string, to: string): Promise<void> {
    this.calls.push(`rename ${from} ${to}`);
    const text = await this.readFile(from);
    this.files.delete(from);
    this.files.set(to, text);
  }

  async unlink(path: string): Promise<void> {
    this.calls.push(`unlink ${path}`);
    await this.readFile(path);
    this.files.delete(path);
  }
}

test("the file store keeps each record under device/ in the data root", async () => {
  const files = new FakeFs();
  const store = fileDeviceStore("/data", files);

  expect(await store.read("identity")).toBeNull();
  await store.write("identity", "key");
  await store.write("pairing", "link");

  expect([...files.files.keys()].sort()).toEqual([
    "/data/device/identity.json",
    "/data/device/pairing.json",
  ]);
  expect(await store.read("identity")).toBe("key");
  expect(await store.read("pairing")).toBe("link");
});

test("the file store replaces a record by renaming a finished temporary file over it", async () => {
  const files = new FakeFs();
  const store = fileDeviceStore("/data", files);
  await store.write("pairing", "old");
  files.calls.length = 0;

  await store.write("pairing", "new");

  expect(files.calls).toEqual([
    "mkdir /data/device",
    "write /data/device/pairing.json.tmp",
    "rename /data/device/pairing.json.tmp /data/device/pairing.json",
  ]);
  expect([...files.files.keys()]).toEqual(["/data/device/pairing.json"]);
  expect(await store.read("pairing")).toBe("new");
});

test("the file store removes a record, and one that is not there is no error", async () => {
  const files = new FakeFs();
  const store = fileDeviceStore("/data", files);
  await store.write("pairing", "link");

  await store.remove("pairing");
  expect(await store.read("pairing")).toBeNull();
  await store.remove("pairing");
});

test("the file store reports a failure that is not a missing file", async () => {
  const files = new FakeFs();
  files.readFile = async () => {
    throw Object.assign(new Error("denied"), { code: "ERR_ACCESS_DENIED" });
  };
  await expect(fileDeviceStore("/data", files).read("identity")).rejects.toMatchObject({
    code: "ERR_ACCESS_DENIED",
  });
});

test("the Storage store keeps each record under its own key", async () => {
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
