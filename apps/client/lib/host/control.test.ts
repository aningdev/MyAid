import { expect, test } from "nsh/test";

import { ensureBackendReady, hostAccess, setHostTransport, type HostTransport } from "./control";
import type { HostStatus } from "./protocol";

function status(phase: string, extra: Partial<HostStatus> = {}): HostStatus {
  return {
    phase,
    version: "test",
    blocked: phase !== "ready",
    generation: phase === "ready" ? "g1" : null,
    pid: phase === "ready" ? 1 : null,
    reason: null,
    url: null,
    ...extra,
  };
}

function fakeTransport(script: {
  initial: HostStatus;
  afterStart?: HostStatus;
  watchFrames?: HostStatus[];
  failWatch?: string;
}): HostTransport {
  let current = script.initial;
  return {
    reachable: async () => true,
    call: async (op) => {
      if (op.op === "status") return current;
      if (op.op === "ensureDsh") {
        current = script.afterStart ?? status("starting");
        return current;
      }
      if (op.op === "connectionInfo") {
        return status("ready", { url: "http://127.0.0.1:9/?token=x" });
      }
      return current;
    },
    watch: async (onStatus, onDown) => {
      if (script.failWatch) {
        onDown(script.failWatch);
        return () => {};
      }
      let i = 0;
      const frames = script.watchFrames ?? [];
      const timer = setInterval(() => {
        const next = frames[i++];
        if (!next) return;
        current = next;
        onStatus(next);
      }, 5);
      return () => clearInterval(timer);
    },
  };
}

test("ensureBackendReady resolves when already ready", async () => {
  setHostTransport(fakeTransport({ initial: status("ready") }));
  try {
    const ready = await ensureBackendReady(1000);
    expect(ready.phase).toBe("ready");
  } finally {
    setHostTransport(null);
  }
});

test("ensureBackendReady waits on watch until ready", async () => {
  setHostTransport(
    fakeTransport({
      initial: status("stopped"),
      afterStart: status("starting"),
      watchFrames: [status("starting"), status("ready")],
    }),
  );
  try {
    const ready = await ensureBackendReady(2000);
    expect(ready.phase).toBe("ready");
  } finally {
    setHostTransport(null);
  }
});

test("ensureBackendReady rejects on failed phase from watch", async () => {
  setHostTransport(
    fakeTransport({
      initial: status("stopped"),
      afterStart: status("starting"),
      watchFrames: [status("failed", { reason: "boom", blocked: true })],
    }),
  );
  try {
    await expect(ensureBackendReady(2000)).rejects.toThrow(/boom|启动失败/);
  } finally {
    setHostTransport(null);
  }
});

test("ensureBackendReady rejects when watch reports connection down", async () => {
  setHostTransport(
    fakeTransport({
      initial: status("stopped"),
      afterStart: status("starting"),
      failWatch: "socket gone",
    }),
  );
  try {
    await expect(ensureBackendReady(2000)).rejects.toThrow(/socket gone/);
  } finally {
    setHostTransport(null);
  }
});

test("hostAccess typed ops hit the transport", async () => {
  setHostTransport(fakeTransport({ initial: status("ready") }));
  try {
    expect((await hostAccess.status()).phase).toBe("ready");
    expect((await hostAccess.start()).phase).toBe("starting");
  } finally {
    setHostTransport(null);
  }
});
