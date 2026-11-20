/**
 * Guard: a test app never touches the local control plane. The user's real Host may be listening
 * on 4872 with the real `~/.dsh-bot`, and `dsh-bot-host` may be on PATH, so an app opened by
 * `test/open.ts` must neither probe a port nor start a process; a real-Host smoke opts in with
 * `DSH_BOT_SMOKE_HOST`.
 *
 * The app-level half proves it by effect: with a probe, the footer would leave "Host disconnected"
 * within the launcher's 1.5 s probe — it would say "Host connected" (a Host answers) or
 * "Starting Host…" (none does). It stays neutral for longer than both.
 */
import { expect, test } from "nsh/test";

import { hostControlAllowed } from "../lib/data-root";
import { createHostTransport } from "../lib/host/client";
import { createHostRegistrationTransport } from "../lib/host/registration";
import { t } from "../lib/i18n";
import { open } from "./open";

test("only a smoke may reach the local control plane", () => {
  // Opened by `test/open.ts`, no smoke: nothing to probe, nothing to spawn.
  expect(hostControlAllowed(true, undefined)).toBe(false);
  expect(hostControlAllowed(true, "")).toBe(false);
  // The smoke opt-in.
  expect(hostControlAllowed(true, "1")).toBe(true);
  expect(hostControlAllowed(true, "empty")).toBe(true);
  // The product itself.
  expect(hostControlAllowed(false, undefined)).toBe(true);
});

/** A fetch that records what it was asked for: a guarded transport must ask nothing. */
function countingFetch() {
  const calls: string[] = [];
  const request = async (url: string | URL | Request): Promise<Response> => {
    calls.push(String(url));
    throw new Error("a guarded transport must not fetch");
  };
  return { calls, request: request as unknown as typeof fetch };
}

test("a guarded transport never fetches, and answers the facts it can", async () => {
  const counted = countingFetch();
  const transport = createHostTransport({
    port: () => 4872,
    token: async () => "tok",
    fetch: counted.request,
    allow: () => false,
  });
  expect(await transport.reachable()).toBe(false);
  await expect(transport.call({ op: "status" })).rejects.toThrow(t("test.noControl"));
  const down: string[] = [];
  await transport.watch(
    () => undefined,
    (reason) => down.push(reason),
  );
  expect(down.length).toBe(1);

  const registration = createHostRegistrationTransport({
    port: () => 4872,
    token: async () => "tok",
    fetch: counted.request,
    allow: () => false,
  });
  expect(await registration.reachable()).toBe(false);
  const snapshot = JSON.parse(await registration.call("registrationQuery")) as {
    phase: string;
    reason: string;
  };
  expect(snapshot.phase).toBe("notRegistered");
  expect(snapshot.reason).toContain(t("test.noControl"));
  await expect(registration.call("registrationEnable")).rejects.toThrow(t("test.noControl"));

  // Nothing above asked for a URL: no probe of the real port, no token read over the wire.
  expect(counted.calls).toEqual([]);
});

test("a test app neither probes for a Host nor starts one", async () => {
  const app = await open("../App.tsx", { width: 1100, height: 800 });
  await app.waitFor("id:host-status", { timeout: 20000 });
  expect(app.shows("id:host-status >> text:Host disconnected")).toBe(true);

  // Longer than the launcher's probe (1.5 s) and a start attempt would need to show.
  await app.wait(4000);
  expect(app.shows("id:host-status >> text:Host disconnected")).toBe(true);
  expect(app.shows("id:host-status >> text:Starting Host…")).toBe(false);
  expect(app.shows("id:host-status >> text:Host connected")).toBe(false);
  expect(app.texts().some((text) => text.startsWith("找不到 dsh-bot-host"))).toBe(false);
}, 60000);
