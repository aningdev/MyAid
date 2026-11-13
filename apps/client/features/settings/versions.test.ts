import { expect, test } from "nsh/test";

import { createHostFactsFixture } from "../../test/settings-fixtures";
import { loadHostFacts, setHostFactsSource } from "./hostFacts";
import { APP_VERSION, diagnosticsText, versionRows } from "./versions";

test("About's rows show MyAid, the Host and dsh", async () => {
  setHostFactsSource(createHostFactsFixture());
  const facts = await loadHostFacts();
  const rows = versionRows(facts);
  expect(rows.myaid).toBe(APP_VERSION);
  expect(rows.host).toBe("0.1.0");
  expect(rows.dsh).toBe("0.2.2-rc.2");
  expect(rows.supportedDsh).toBe("0.2.2-rc.2");
  setHostFactsSource(null);
});

test("the copied diagnostics carry versions and connection state, never a secret", async () => {
  setHostFactsSource(createHostFactsFixture());
  const facts = await loadHostFacts();
  const text = diagnosticsText(facts);
  expect(text).toContain(`MyAid: ${APP_VERSION}`);
  expect(text).toContain("Host: 0.1.0");
  expect(text).toContain("dsh: 0.2.2-rc.2");
  expect(text).toContain("Host 连接: 已连接");
  expect(text).not.toMatch(/sk-|token|Bearer/i);
  setHostFactsSource(null);
});
