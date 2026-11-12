/**
 * Test-only entry: the Inspector beside a Session chat, and Bot Settings, over
 * sources the test supplies instead of a Host. `nsh test` opens it; nothing in
 * the product imports it and no production path installs these sources.
 *
 * What it stands in for: the dsh projections behind Usage (a real Session's
 * numbers), `/compact`, `deliverables/presented`, and the `pluginInventory` /
 * `skills` reads Bot Settings shows.
 */
import { mount, View } from "nsh";

import { sessionAddress } from "../../components/shell/navAddresses";
import { setPanelAddress } from "../../components/shell/state";
import { colors } from "../../components/ui";
import { BotSettings } from "../bots/BotSettings";
import { setBotFactsSource } from "../bots/facts";
import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  renameClaim,
} from "../bots/model";
import { ready, registry } from "../bots/state";
import { ChatPane } from "../dialogue/ChatPane";
import type { SessionTransport } from "../dialogue/session/claimed";
import { SessionRegistry } from "../dialogue/session/controller";
import { modelCatalog, refreshSessionList, sessionReady } from "../dialogue/session/runtime";
import { setInspectorSource } from "./facts";
import { Inspector } from "./Inspector";

export const BOT = "bot";
export const DIALOGUE = "dlg";
export const SESSION = "s1";

registry.set(
  renameClaim(
    claimSession(
      createDialogue(
        initializeBot(
          createBot(
            createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
            {
              name: "Ada",
              description: "Keeps the release branch tidy",
              templateId: "tmpl",
              defaultModel: "deepseek/deepseek-chat",
              defaultThinking: "high",
              defaultWorkspacePath: "/Users/ada/release",
            },
            BOT,
          ),
          BOT,
        ),
        { botId: BOT, workspacePath: "/Users/ada/release" },
        DIALOGUE,
      ),
      DIALOGUE,
      SESSION,
    ),
    DIALOGUE,
    SESSION,
    "Release notes for 0.4",
  ),
);
ready.set(true);
// The Inspector reads usage once the Connection is up; this harness is its Host.
sessionReady.set(true);
void refreshSessionList();

modelCatalog.set({
  default: { provider: "deepseek", model: "deepseek-chat" },
  models: [
    {
      provider: "deepseek",
      providerName: "DeepSeek",
      model: "deepseek-chat",
      name: "DeepSeek Chat",
      thinking: [
        { id: "low", name: "Low" },
        { id: "high", name: "High" },
      ],
      defaultThinking: "high",
    },
    {
      provider: "deepseek",
      providerName: "DeepSeek",
      model: "deepseek-reasoner",
      name: "DeepSeek Reasoner",
    },
  ],
  failures: [],
});

const userMessage = {
  seq: 1,
  type: "user/message",
  time: Date.now() - 90_000,
  data: { content: "Draft the 0.4 release notes from the changelog.", source: { kind: "user" } },
};

const assistantMessage = {
  seq: 2,
  type: "assistant/message",
  time: Date.now() - 60_000,
  data: {
    message: {
      content: [
        {
          type: "text",
          text:
            "Here are the 0.4 release notes, grouped by theme.\n\n" +
            "## Inspector\n\n" +
            "A Session Panel keeps a narrow column for the Bot, the Dialogue, the " +
            "deliverables and the context it has spent, with Compact in place.\n\n" +
            "## Bot Settings\n\n" +
            "One sheet over Profile, Runs with, Skills and Plugins — the product " +
            "face of the Bot's single Agent preset.",
        },
      ],
    },
  },
};

const transport: SessionTransport = {
  ready: true,
  createSession: async () => ({ sessionId: SESSION }),
  listSessions: async () => [],
  follow: (_sessionId, onFrame) => {
    // A durable window only: what a recovered follow looks like, with no live
    // frames and no local turn.
    queueMicrotask(() =>
      onFrame({
        type: "snapshot",
        hasMore: false,
        records: [
          { type: "event", event: userMessage },
          { type: "event", event: assistantMessage },
        ],
      } as never),
    );
    return () => undefined;
  },
  sessionPage: async () => ({ records: [], hasMore: false }),
  sessionQueue: async () => [],
  prompt: async () => undefined,
  cancel: async () => undefined,
  withdrawQueuedPrompt: async () => undefined,
  renameSession: async () => undefined,
  uploadFile: async () => ({ receiptId: "receipt" }),
  modelCatalog: async () =>
    modelCatalog() ?? {
      default: { provider: "deepseek", model: "deepseek-chat" },
      models: [],
      failures: [],
    },
  selectModel: async () => undefined,
  selectAgentPreset: async () => "standard",
  approvals: () => undefined,
  dispose: async () => undefined,
};

const controllers = new SessionRegistry({
  ensureTransport: async () => transport,
  transport: () => transport,
  registry: () => registry(),
  summaries: () => new Map(),
  onChange: () => undefined,
});
const controller = controllers.controllerFor(SESSION);

setInspectorSource({
  usage: async () => ({
    contextWindow: 1_048_576,
    pressureTokens: 23_489,
    projectedTokens: 28_106,
    tokens: {
      uncachedInputTokens: 1_335,
      outputTokens: 17_893,
      cacheReadTokens: 98_560,
      cacheWriteTokens: 0,
    },
  }),
  command: async () => ({ kind: "success", text: "历史已压缩。" }),
  canReveal: async () => true,
  reveal: async () => undefined,
  deliverables: () => [
    { path: "/Users/ada/release/RELEASE-0.4.md", description: "Release notes, 0.4" },
    { path: "/Users/ada/release/changelog-summary.md", description: "Grouped changelog" },
  ],
});

setBotFactsSource(async (request) => ({
  skills: [
    {
      name: "release-notes",
      description: "Write release notes from the changelog",
      modelInvocable: true,
    },
    { name: "commit-report", description: "Summarise a week of commits", modelInvocable: false },
  ],
  preset: {
    id: request.presetId,
    isDefault: false,
    rows: [
      {
        entryId: "tool-bash",
        moduleName: "@deepseek-ai/dsh-tool-bash",
        name: "Bash",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "tool-present",
        moduleName: "@deepseek-ai/dsh-tool-present",
        name: "Present",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "tool-market",
        moduleName: "@deepseek-ai/dsh-tool-plugin-market",
        name: "Plugin market",
        enabled: false,
        fiberPhase: null,
      },
    ],
  },
}));
// The Panel shows this Session: the Inspector reads the address, as in the shell.
setPanelAddress(
  "panel-1",
  sessionAddress({
    sessionId: SESSION,
    label: "Release notes for 0.4",
    botId: BOT,
    dialogueId: DIALOGUE,
  }),
);

function Harness() {
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
      {/* The Panel's chat over the harness transport, beside the Inspector it
          keeps open (the shell nests them in a ResizablePanelGroup; a fixed
          row draws the same and needs no measured width in a test). */}
      <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <ChatPane controller={controller} />
        </View>
        <Inspector panelId="panel-1" sessionId={SESSION} />
      </View>
      <BotSettings />
    </View>
  );
}

mount(Harness);
