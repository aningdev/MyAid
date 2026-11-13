/**
 * Test-only entry: the real Workspace Shell with one difference — the
 * launcher's "the Host exited" report is delivered, so a Pane shows the
 * session-error banner. `nsh test` opens it with seeded storage; nothing in
 * the product imports it.
 */
import { effect, mount } from "nsh";

import { AppShell } from "../components/AppShell";
import { noteHostLost } from "../features/dialogue/session/runtime";
import { t } from "../lib/i18n";

function Harness() {
  // The same call `components/shell/host.ts` makes when the launcher reports
  // an exit; reading `t` keeps the message in the app's language.
  effect(() => {
    noteHostLost(t("host.exitedNotice"));
  });
  return <AppShell />;
}

mount(Harness);
