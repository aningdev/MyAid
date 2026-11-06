/**
 * Mirror of apps/host/testdata/host-contract-cases.json (NSH tests cannot read that path).
 * Keep cases in sync when changing Host `parse_ready_url` / Status::validate.
 */
import { expect, test } from "nsh/test";

import {
  assertConnectionInfo,
  assertPublicStatus,
  parseReadyUrl,
  type HostStatus,
} from "./protocol";

type Case = {
  name: string;
  kind: "readyUrl" | "publicStatus" | "connectionInfo";
  url?: string;
  status?: HostStatus;
  ok: boolean;
};

/** Minimal duplicate of host-contract-cases.json — see that file for the full set. */
const cases: Case[] = [
  {
    name: "valid_ready_url",
    kind: "readyUrl",
    url: "http://127.0.0.1:9876/?token=secret",
    ok: true,
  },
  {
    name: "missing_token",
    kind: "readyUrl",
    url: "http://127.0.0.1:9876/",
    ok: false,
  },
  {
    name: "non_loopback",
    kind: "readyUrl",
    url: "http://192.168.1.10:9876/?token=secret",
    ok: false,
  },
  {
    name: "public_frame_with_url_rejected",
    kind: "publicStatus",
    status: {
      phase: "ready",
      generation: "abc",
      pid: 42,
      version: "0.2.2-rc.1",
      blocked: false,
      url: "http://127.0.0.1:9876/?token=secret",
    },
    ok: false,
  },
  {
    name: "connection_info_ok",
    kind: "connectionInfo",
    status: {
      phase: "ready",
      generation: "abc",
      pid: 42,
      version: "0.2.2-rc.1",
      blocked: false,
      url: "http://127.0.0.1:9876/?token=secret",
    },
    ok: true,
  },
];

test("shared host-contract cases align with TS validators", () => {
  for (const item of cases) {
    let ok = true;
    try {
      if (item.kind === "readyUrl") {
        parseReadyUrl(item.url!);
      } else if (item.kind === "publicStatus") {
        assertPublicStatus(item.status!);
      } else {
        assertConnectionInfo(item.status!);
      }
    } catch {
      ok = false;
    }
    expect(ok).toBe(item.ok);
  }
});

test("valid ready URL accepted", () => {
  const url = parseReadyUrl("http://127.0.0.1:9876/?token=secret");
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.searchParams.get("token")).toBe("secret");
});

test("missing token rejected", () => {
  expect(() => parseReadyUrl("http://127.0.0.1:9876/")).toThrow();
});

test("non-loopback rejected", () => {
  expect(() => parseReadyUrl("http://192.168.1.10:9876/?token=secret")).toThrow();
});

test("public frame with url rejected", () => {
  expect(() =>
    assertPublicStatus({
      phase: "ready",
      generation: "abc",
      pid: 42,
      version: "0.2.2-rc.1",
      blocked: false,
      url: "http://127.0.0.1:9876/?token=secret",
    }),
  ).toThrow();
});
