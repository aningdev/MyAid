/**
 * The About page's facts: this app's release version and the diagnostic text
 * the copy button puts on the clipboard. The Host and dsh versions come from
 * the Host's public status (`hostFacts`); a version it has not reported stays
 * an em dash rather than a guess.
 */
import { platform } from "nsh";

import { t } from "../../lib/i18n";
import { lifecycleLabel, type HostFacts } from "./hostFacts";

/** Keep in step with `apps/client/package.json` and `nsh.json`. */
export const APP_VERSION = "0.1.0";

export type VersionRows = {
  myaid: string;
  host: string;
  dsh: string;
  supportedDsh: string;
  hostPhase: string;
};

export function versionRows(facts: HostFacts): VersionRows {
  return {
    myaid: APP_VERSION,
    host: facts.hostVersion ?? "—",
    dsh: facts.actualDsh ?? facts.supportedDsh ?? "—",
    supportedDsh: facts.supportedDsh ?? "—",
    hostPhase: facts.status?.phase ?? (facts.reachable ? "ready" : "stopped"),
  };
}

/**
 * The text 「复制诊断信息」 copies: versions and connection state, no paths,
 * tokens, keys, or session content.
 */
export function diagnosticsText(facts: HostFacts): string {
  const rows = versionRows(facts);
  const phase = lifecycleLabel(rows.hostPhase);
  const lines = [
    t("diagnostics.title"),
    `MyAid: ${rows.myaid}`,
    t("diagnostics.host", { version: rows.host, phase }),
    t("diagnostics.dsh", { version: rows.dsh }),
    t("diagnostics.supported", { version: rows.supportedDsh }),
    t("diagnostics.hostState", {
      state: facts.reachable ? t("background.connected") : t("background.disconnected"),
    }),
    t("diagnostics.dshWeb", { phase }),
  ];
  if (facts.mismatch) lines.push(t("diagnostics.problem", { problem: facts.mismatch }));
  if (facts.errors.length > 0) {
    lines.push(
      t("diagnostics.recentErrors", {
        errors: facts.errors.join(t("diagnostics.errorSeparator")),
      }),
    );
  }
  lines.push(t("diagnostics.platform", { os: platform.os, version: platform.version }));
  return `${lines.join("\n")}\n`;
}
