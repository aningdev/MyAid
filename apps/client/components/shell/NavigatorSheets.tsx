/**
 * The Navigator's two small forms, mounted once by the shell: rename a
 * Dialogue or a Session, and start a new Dialogue in a Bot's workspace.
 */
import { effect, signal, Text, View, windowSize } from "nsh";

import { registry } from "../../features/bots/state";
import { createSession, renameSession } from "../../features/dialogue/session/runtime";
import {
  createDialogueOnPath,
  messageOf,
  renameDialogue,
} from "../../features/workspace/dialogues";
import { workspaceOf, workspaces } from "../../features/workspace/state";
import { Button, colors, Field, Sheet } from "../ui";
import { dialogueAddress, sessionAddress } from "./navAddresses";
import { closeNewDialogue, closeRename, newDialogueTarget, renameTarget } from "./navSheets";
import { openAddress } from "./state";

const SHEET_WIDTH = 460;

export function NavigatorSheets() {
  // Overlay components: an array keeps them from taking layout space.
  return [<RenameSheet />, <NewDialogueSheet />];
}

function RenameSheet() {
  const target = () => renameTarget();
  const value = signal("");
  const failure = signal<string | null>(null);
  const busy = signal(false);

  let wasOpen = false;
  effect(() => {
    const current = target();
    if (current && !wasOpen) {
      value.set(current.value);
      failure.set(null);
      busy.set(false);
    }
    wasOpen = current !== null;
  });

  const save = async (): Promise<void> => {
    const current = target();
    if (!current || busy()) return;
    const next = value().trim();
    busy.set(true);
    failure.set(null);
    try {
      if (current.kind === "session") {
        await renameSession(current.sessionId, next);
      } else {
        // A Dialogue's name is its Workspace's title (shared by its Bots).
        await renameDialogue(current.dialogueId, next);
      }
      closeRename();
    } finally {
      busy.set(false);
    }
  };

  return (
    <Sheet
      open={target() !== null}
      side="top"
      onClose={closeRename}
      popupStyle={{
        width: SHEET_WIDTH,
        marginLeft: Math.max(0, (windowSize().width - SHEET_WIDTH) / 2),
      }}
    >
      <If when={target()}>
        {(current) => (
          <View style={{ gap: 12 }} testID="rename-sheet">
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
              {current().kind === "session" ? "Rename Session" : "Rename Dialogue"}
            </Text>
            <Field
              label="Name"
              testID="rename-name"
              value={value()}
              placeholder={current().value}
              onChange={(next) => {
                failure.set(null);
                value.set(next);
              }}
            />
            <If when={!!failure()}>
              <Text style={{ fontSize: 12, color: colors.danger }}>{failure()}</Text>
            </If>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label="Cancel" size="small" variant="ghost" onPress={closeRename} />
              <Button
                label={busy() ? "Saving…" : "Save"}
                size="small"
                variant="accent"
                disabled={busy()}
                onPress={() => void save()}
              />
            </View>
          </View>
        )}
      </If>
    </Sheet>
  );
}

function NewDialogueSheet() {
  const target = () => newDialogueTarget();
  const workspace = signal("");
  const failure = signal<string | null>(null);
  const busy = signal(false);

  let wasOpen = false;
  effect(() => {
    const current = target();
    if (current && !wasOpen) {
      workspace.set(current.workspacePath);
      failure.set(null);
      busy.set(false);
    }
    wasOpen = current !== null;
  });

  const choose = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (path) workspace.set(path);
    } catch (error) {
      failure.set(error instanceof Error ? error.message : String(error));
    }
  };

  const create = async (): Promise<void> => {
    const current = target();
    const path = workspace().trim();
    if (!current || !path || busy()) return;
    busy.set(true);
    failure.set(null);
    try {
      const created = await createDialogueOnPath(current.botId, path);
      if (!created) {
        failure.set("Could not start the Dialogue.");
        return;
      }
      closeNewDialogue();
      openAddress(
        dialogueAddress({
          id: created.id,
          title: workspaceOf(workspaces(), created)?.title ?? "",
          botId: current.botId,
          botName: current.botName,
        }),
      );
      // A new Dialogue is useful at once: start its first Session when dsh answers.
      try {
        const sessionId = await createSession(created.id);
        const claim =
          registry()
            .dialogues.find((item) => item.id === created.id)
            ?.claims.find((item) => item.sessionId === sessionId) ?? null;
        openAddress(
          sessionAddress({
            sessionId,
            label: claim?.title ?? "Session",
            botId: current.botId,
            dialogueId: created.id,
          }),
        );
        const { requestComposerFocus } = await import("../../features/dialogue/chat/focus");
        requestComposerFocus(sessionId);
      } catch {
        // The Dialogue is open; its own New Session retries when dsh is up.
      }
    } catch (error) {
      failure.set(messageOf(error));
    } finally {
      busy.set(false);
    }
  };

  return (
    <Sheet
      open={target() !== null}
      side="top"
      onClose={closeNewDialogue}
      popupStyle={{
        width: SHEET_WIDTH,
        marginLeft: Math.max(0, (windowSize().width - SHEET_WIDTH) / 2),
      }}
    >
      <If when={target()}>
        {(current) => (
          <View style={{ gap: 12 }} testID="new-dialogue-sheet">
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
              {`New Dialogue · ${current().botName}`}
            </Text>
            <Field
              label="Workspace"
              testID="new-dialogue-workspace"
              value={workspace()}
              placeholder="/Users/you/Work/project"
              onChange={(next) => {
                failure.set(null);
                workspace.set(next);
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="Choose Folder…" size="small" onPress={() => void choose()} />
            </View>
            <If when={!!failure()}>
              <Text style={{ fontSize: 12, color: colors.danger }}>{failure()}</Text>
            </If>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label="Cancel" size="small" variant="ghost" onPress={closeNewDialogue} />
              <Button
                label={busy() ? "Starting…" : "Start Dialogue"}
                size="small"
                variant="accent"
                disabled={busy() || !workspace().trim()}
                onPress={() => void create()}
              />
            </View>
          </View>
        )}
      </If>
    </Sheet>
  );
}
