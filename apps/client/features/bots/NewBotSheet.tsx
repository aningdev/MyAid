/**
 * New Bot: a sheet with the Bot's name, its dsh preset, the mark it wears
 * and the workspace of its first Dialogue. Creating it writes the Bot, its
 * Dialogue and (when dsh answers) the first Session, then opens that chat
 * with the keyboard in the composer. The first launch's welcome state leads
 * here, as does ⇧⌘N, the Bots section's `+` and the palette.
 */
import { effect, signal, Text, View, windowSize } from "nsh";

import { dialogueAddress, sessionAddress } from "../../components/shell/navAddresses";
import { openAddress } from "../../components/shell/state";
import { Button, colors, Field, radius, Sheet } from "../../components/ui";
import { requestComposerFocus } from "../dialogue/chat/focus";
import { createDialogueOnPath } from "../workspace/dialogues";
import { workspaceOf, workspaces } from "../workspace/state";
import { BotIdentityPicker, BotMark } from "./BotMark";
import { nextIdentity, type BotIdentity } from "./identity";
import { createBot, initializeBot, newId } from "./model";
import { closeNewBot, newBotOpen } from "./newBot";
import { sessionLabel } from "./sessions";
import {
  actionError,
  changeRegistry,
  clearActionError,
  importDshTemplates,
  ready,
  registry,
  saving,
  writeBlocked,
} from "./state";

const SHEET_WIDTH = 560;

export function NewBotSheet() {
  return (
    <Sheet
      open={newBotOpen()}
      side="top"
      onClose={closeNewBot}
      popupStyle={{
        width: SHEET_WIDTH,
        marginLeft: Math.max(0, (windowSize().width - SHEET_WIDTH) / 2),
        gap: 14,
      }}
    >
      <If when={newBotOpen()}>
        <Body />
      </If>
    </Sheet>
  );
}

function Body() {
  const name = signal("");
  const templateId = signal("");
  const workspace = signal("");
  const identity = signal<BotIdentity>(nextIdentity(registry().bots.length));
  const localError = signal<string | null>(null);
  const creating = signal(false);

  const templates = () => registry().templates;
  const chosen = () =>
    templates().find((item) => item.id === templateId()) ?? templates()[0] ?? null;

  // A fresh sheet starts from the first template and an empty name.
  let wasOpen = false;
  effect(() => {
    const open = newBotOpen();
    if (open && !wasOpen) {
      name.set("");
      workspace.set("");
      localError.set(null);
      creating.set(false);
      clearActionError();
      identity.set(nextIdentity(registry().bots.length));
      templateId.set(templates()[0]?.id ?? "");
    }
    wasOpen = open;
  });

  // A registry with no templates yet asks dsh for its presets once.
  let asked = false;
  effect(() => {
    if (!newBotOpen() || asked) return;
    asked = true;
    if (templates().length === 0 && !writeBlocked()) void importDshTemplates();
  });

  // The first template arrives (or the chosen one disappeared): follow it.
  effect(() => {
    const list = templates();
    if (list.length === 0) return;
    if (!list.some((item) => item.id === templateId())) templateId.set(list[0]!.id);
  });

  const chooseWorkspace = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (path) workspace.set(path);
    } catch (error) {
      localError.set(error instanceof Error ? error.message : String(error));
    }
  };

  const canCreate = () =>
    !writeBlocked() &&
    !creating() &&
    !!ready() &&
    !!name().trim() &&
    !!chosen() &&
    !!workspace().trim();

  const create = async (): Promise<void> => {
    if (!canCreate()) return;
    const template = chosen();
    if (!template) return;
    const botId = newId();
    const path = workspace().trim();
    creating.set(true);
    localError.set(null);
    try {
      const bot = await changeRegistry((reg) =>
        initializeBot(
          createBot(
            reg,
            {
              name: name(),
              templateId: template.id,
              defaultWorkspacePath: path,
              identity: identity(),
            },
            botId,
          ),
          botId,
        ),
      );
      if (!bot) {
        localError.set(actionError() ?? "Could not create the Bot.");
        return;
      }
      // The Bot is saved; its Panel is the surface from here on. The Dialogue
      // lives on a dsh Workspace, so that step needs the Host.
      closeNewBot();
      const dialogue = await createDialogueOnPath(botId, path);
      // A refusal is on `actionError`, which the new Bot's Panel shows.
      if (!dialogue) return;
      // The Session may still fail, in which case the Dialogue is the surface.
      const { createSession } = await import("../dialogue/session/runtime");
      try {
        const sessionId = await createSession(dialogue.id);
        const claim =
          registry()
            .dialogues.find((item) => item.id === dialogue.id)
            ?.claims.find((item) => item.sessionId === sessionId) ?? null;
        openAddress(
          sessionAddress({
            sessionId,
            label: sessionLabel(claim ?? { title: null }, null),
            botId,
            dialogueId: dialogue.id,
          }),
        );
        requestComposerFocus(sessionId);
      } catch {
        openAddress(
          dialogueAddress({
            id: dialogue.id,
            title: workspaceOf(workspaces(), dialogue)?.title ?? "",
            botId,
            botName: name(),
          }),
        );
      }
    } finally {
      creating.set(false);
    }
  };

  return (
    <View style={{ gap: 14 }} testID="new-bot-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BotMark identity={identity()} size={38} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>New Bot</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            A name, a look and the workspace of its first Dialogue.
          </Text>
        </View>
      </View>

      <Field
        label="Name"
        testID="new-bot-name"
        value={name()}
        placeholder="Ada"
        onChange={(value) => {
          localError.set(null);
          name.set(value);
        }}
      />

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Template</Text>
        <If
          when={templates().length > 0}
          else={
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
                {saving() ? "Reading dsh presets…" : "No templates yet. Import them from dsh."}
              </Text>
              <Button
                label="Import presets from dsh"
                size="small"
                disabled={writeBlocked()}
                onPress={() => void importDshTemplates()}
              />
            </View>
          }
        >
          <View style={{ gap: 4 }}>
            <Each of={templates()}>
              {(template) => (
                <View
                  onPress={() => templateId.set(template().id)}
                  role="button"
                  accessibilityLabel={`Template ${template().name}`}
                  accessibilityState={{ selected: chosen()?.id === template().id }}
                  testID={`new-bot-template-${template().id}`}
                  style={{
                    minHeight: 38,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 10,
                    borderRadius: radius.control,
                    borderCurve: "continuous",
                    borderWidth: 1,
                    borderColor: chosen()?.id === template().id ? colors.accent : colors.border,
                    backgroundColor: chosen()?.id === template().id ? colors.inset : "transparent",
                  }}
                >
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
                      {template().name}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {`Agent preset · ${template().presetId}`}
                    </Text>
                  </View>
                  <If when={chosen()?.id === template().id}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>
                      Selected
                    </Text>
                  </If>
                </View>
              )}
            </Each>
          </View>
        </If>
      </View>

      <BotIdentityPicker identity={identity} onChange={identity.set} />

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
          First Dialogue workspace
        </Text>
        <Field
          label="Path"
          testID="new-bot-workspace"
          value={workspace()}
          placeholder="/Users/you/Work/project"
          onChange={(value) => {
            localError.set(null);
            workspace.set(value);
          }}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="Choose Folder…"
            size="small"
            disabled={writeBlocked()}
            onPress={() => void chooseWorkspace()}
          />
        </View>
      </View>

      <If when={!!(localError() ?? actionError())}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
          {localError() ?? actionError()}
        </Text>
      </If>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button label="Cancel" size="small" variant="ghost" onPress={closeNewBot} />
        <Button
          label={creating() ? "Creating…" : "Create Bot"}
          size="small"
          variant="accent"
          disabled={!canCreate()}
          onPress={() => void create()}
        />
      </View>
    </View>
  );
}
