/**
 * Test-only entry: Settings over a fake Host control plane. The product never
 * imports it. `page` mounts Settings alone, so a phone-width window can show
 * the devices group without the shell's desktop-width gate.
 */
import { host, mount, platform, token, View } from "nsh";

import { AppShell } from "../../components/AppShell";
import { setHostTransport } from "../../lib/host/control";
import { SettingsPage } from "../settings/Page";
import { createDevicesFixture } from "./fixture";

setHostTransport(
  createDevicesFixture({
    unconfigured: host.params.unconfigured === true,
    expired: host.params.expired === true,
    watch: host.params.watch === true,
  }),
);

/** The os this app was opened as. Tests read the label; it is not product UI. */
function PlatformMark() {
  return (
    <View
      testID="devices-harness-platform"
      accessibilityLabel={`platform-${platform.os}`}
      style={{ width: 1, height: 1 }}
    />
  );
}

function PageOnly() {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: token("background") }}>
      <PlatformMark />
      <SettingsPage />
    </View>
  );
}

function Shell() {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <PlatformMark />
      <AppShell />
    </View>
  );
}

mount(host.params.page === true ? PageOnly : Shell);
