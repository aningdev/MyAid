/**
 * A test-only Source adapter: no network, no credentials, no package.
 *
 * It registers a kind whose Owner identity is one configured id, keeps every
 * message written back into its Channel, and lets a test deliver Triggers as
 * if a person had sent them.
 */
import { z } from "zod";

import type { SourceOutbound } from "../sources.ts";
import { SourceRegistry } from "../sources.ts";

export type FakeSent = SourceOutbound & { source: string };

export class FakeSource {
  readonly registry = new SourceRegistry();
  readonly sent: FakeSent[] = [];
  readonly instanceId = "source-fake";
  readonly owner = "owner-1";

  constructor() {
    this.registry.register({
      kind: {
        kind: "fake",
        title: { zh: "测试 Source", en: "Fake Source" },
        description: "测试用 Source；只在测试里注册，不随包发布。",
        config: z.object({ owner: z.string() }),
        owner: (config) => config.owner,
        channel: {
          send: async (instance, message) => {
            this.sent.push({ source: instance.id, ...message });
            return "sent";
          },
        },
      },
      instance: { id: this.instanceId, enabled: true, config: { owner: this.owner } },
    });
  }
}
