// Spec acceptance 4 (and the delete half of 3): a Bot made and renamed on one
// Device reaches the other Device's `watch` without a refresh, and no Device
// can delete the Main Bot through the Relay.

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { type ConnectedDevice, connectedDevice } from "../support/device";
import { officialDsh, type RealStack, startRealStack } from "../support/real-stack";
import { type Watch, watching } from "../support/watch";

describe.skipIf(!officialDsh)("the Registry on two Devices", () => {
  let stack: RealStack;
  let phone: ConnectedDevice;
  let desktop: ConnectedDevice;
  let seen: Watch<Awaited<ReturnType<ConnectedDevice["bots"]["snapshot"]>>>;

  beforeAll(async () => {
    stack = await startRealStack(() => ({ text: "ok" }));
    phone = await connectedDevice(stack, "e2e-phone");
    desktop = await connectedDevice(stack, "e2e-desktop");
    seen = watching((signal) => desktop.bots.watch(signal));
  });

  afterAll(async () => {
    seen?.stop();
    await phone?.close();
    await desktop?.close();
    await stack?.stop();
  });

  test("a Bot created and renamed on one Device shows up on the other", async () => {
    const created = seen.until((snapshot) =>
      snapshot.registry.bots.some((bot) => bot.id === "researcher" && bot.name === "Researcher"),
    );
    await phone.bots.createBot({ id: "researcher", name: "Researcher", templateId: "standard" });
    expect((await created).registry.bots.map((bot) => bot.id)).toEqual(["bots-main", "researcher"]);

    const renamed = seen.until((snapshot) =>
      snapshot.registry.bots.some((bot) => bot.id === "researcher" && bot.name === "Analyst"),
    );
    await phone.bots.updateBot({ id: "researcher", patch: { name: "Analyst" } });
    const after = await renamed;
    expect(after.registry.bots.filter((bot) => bot.id === "researcher")).toHaveLength(1);
    // The same single copy: the phone reads back exactly what the desktop saw.
    expect((await phone.bots.snapshot()).revision).toBe(after.revision);
  });

  test("the Main Bot cannot be deleted from either Device", async () => {
    await expect(phone.bots.deleteBot("bots-main")).rejects.toThrow("bots/main-bot");
    await expect(desktop.bots.deleteBot("bots-main")).rejects.toThrow("bots/main-bot");
    expect((await phone.bots.snapshot()).registry.bots.map((bot) => bot.id)).toContain("bots-main");
  });
});
