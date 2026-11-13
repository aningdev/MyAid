import { expect, test } from "nsh/test";

import { sessionCreateBody } from "./connection";

test("a Session joins its Workspace: never both workspaceId and cwd", () => {
  expect(sessionCreateBody({ workspaceId: "ws", cwd: "/tmp", agentPreset: "standard" })).toEqual({
    workspaceId: "ws",
    agentPreset: "standard",
  });
  // Without a Workspace the cwd is the only location the Host can take.
  expect(sessionCreateBody({ cwd: "/tmp" })).toEqual({ cwd: "/tmp" });
  expect(sessionCreateBody()).toEqual({});
});
