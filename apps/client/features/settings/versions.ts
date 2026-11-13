/**
 * The About page's facts: this app's release version and the diagnostic text
 * the copy button puts on the clipboard. The Host and dsh versions come from
 * the Host's public status (`hostFacts`); a version it has not reported stays
 * an em dash rather than a guess.
 */
import { platform } from "nsh";

import type { HostFacts } from "./hostFacts";

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
  const lines = [
    "MyAid 诊断信息",
    `MyAid: ${rows.myaid}`,
    `Host: ${rows.host}（${rows.hostPhase}）`,
    `dsh: ${rows.dsh}`,
    `dsh 支持版本: ${rows.supportedDsh}`,
    `Host 连接: ${facts.reachable ? "已连接" : "未连接"}`,
    `dsh web: ${rows.hostPhase}`,
  ];
  if (facts.mismatch) lines.push(`问题: ${facts.mismatch}`);
  if (facts.errors.length > 0) lines.push(`最近错误: ${facts.errors.join("；")}`);
  lines.push(`平台: ${platform.os} ${platform.version}`);
  return `${lines.join("\n")}\n`;
}
