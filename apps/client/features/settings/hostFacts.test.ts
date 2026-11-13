import { afterEach, expect, test } from "nsh/test";

import { createHostFactsFixture } from "../../test/settings-fixtures";
import {
  hostFacts,
  loadHostFacts,
  restartBackground,
  setHostFactsSource,
  startBackground,
  stopBackground,
  type HostFactsSource,
} from "./hostFacts";

afterEach(() => {
  setHostFactsSource(null);
});

test("the Host's public status carries both versions and the phase", async () => {
  setHostFactsSource(createHostFactsFixture());
  const facts = await loadHostFacts();
  expect(facts.phase).toBe("ready");
  expect(facts.hostVersion).toBe("0.1.0");
  expect(facts.actualDsh).toBe("0.2.2-rc.2");
  expect(facts.supportedDsh).toBe("0.2.2-rc.2");
  expect(facts.mismatch).toBe(null);
});

test("a version mismatch names the actual and supported dsh", async () => {
  setHostFactsSource(
    createHostFactsFixture({
      dshVersion: "0.2.2-rc.1",
      phase: "failed",
      reason: "官方 dsh 版本不兼容：实际 0.2.2-rc.1，需要 0.2.2-rc.2",
    }),
  );
  const facts = await loadHostFacts();
  expect(facts.actualDsh).toBe("0.2.2-rc.1");
  expect(facts.supportedDsh).toBe("0.2.2-rc.2");
  expect(facts.mismatch).toContain("0.2.2-rc.1");
  expect(facts.mismatch).toContain("0.2.2-rc.2");
  expect(facts.errors.join(" ")).toContain("版本不兼容");
});

test("start, stop and restart re-read the Host's status", async () => {
  const fixture = createHostFactsFixture();
  setHostFactsSource(fixture);
  await loadHostFacts();
  expect((await stopBackground()).status?.phase).toBe("stopped");
  expect((await startBackground()).status?.phase).toBe("ready");
  expect((await restartBackground()).status?.phase).toBe("ready");
});

test("a Host that does not answer leaves the unavailable state", async () => {
  const offline = (() => Promise.reject(new Error("宿主未运行"))) as never;
  const source: HostFactsSource = {
    status: offline,
    start: offline,
    stop: offline,
    restart: offline,
    launcher: () => ({
      phase: "failed",
      port: 4882,
      failure: { kind: "missing_binary" },
    }),
  };
  setHostFactsSource(source);
  const facts = await loadHostFacts();
  expect(facts.phase).toBe("unavailable");
  expect(facts.reachable).toBe(false);
  expect(facts.errors.join(" ")).toContain("宿主未运行");
  expect(facts.errors.join(" ")).toContain("myaid-host");
  expect(hostFacts().phase).toBe("unavailable");
});
