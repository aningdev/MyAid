/**
 * New Bot: a dialog with the Bot's name, its dsh preset, the mark it wears
 * and its first working directory. Creating it writes the Bot, opens its Pane,
 * then creates its first segment (when dsh answers), with the keyboard in the
 * composer. The first launch's welcome state leads here, as do ⌘N, the list's
 * "New Bot" row and the palette.
 */
import { effect, signal, Text, View, token } from "nsh";

import { openBot } from "../../components/shell/state";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { Field, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { t } from "../../lib/i18n";
import { radius } from "../../lib/theme";
import { requestComposerFocus } from "../dialogue/chat/focus";
import { startSegment } from "../workspace/conversation";
import { BotIdentityPicker, BotMark } from "./BotMark";
import { nextIdentity, type BotIdentity } from "./identity";
import { createBot, initializeBot, newId } from "./model";
import { closeNewBot, newBotOpen } from "./newBot";
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

const DIALOG_WIDTH = 560;

/** The New Bot dialog, mounted once by the shell. */
export function NewBotDialog() {
  return (
    <Dialog
      open={newBotOpen()}
      onOpenChange={({ open: next }) => {
        if (!next) closeNewBot();
      }}
    >
      <DialogContent width={DIALOG_WIDTH} accessibilityLabel={t("newBot.title")}>
        <If when={newBotOpen()}>
          <Body />
        </If>
      </DialogContent>
    </Dialog>
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

  // A fresh dialog starts from the first template and an empty name.
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
        localError.set(actionError() ?? t("newBot.createFailed"));
        return;
      }
      // The Bot is saved; its Pane is the surface from here on. The segment
      // lives in a dsh Workspace and needs the Host, so it may still fail: the
      // Pane then offers to start the conversation again.
      closeNewBot();
      openBot(botId);
      const sessionId = await startSegment(botId, path);
      if (sessionId) requestComposerFocus(sessionId);
    } finally {
      creating.set(false);
    }
  };

  return (
    <View style={{ gap: 14 }} testID="new-bot-sheet">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <BotMark identity={identity()} size={38} />
        <View style={{ flex: 1, gap: 2 }}>
          <DialogTitle>{t("newBot.title")}</DialogTitle>
          <Text style={{ fontSize: 12, color: token("muted-foreground") }}>{t("newBot.note")}</Text>
        </View>
      </View>

      <Field>
        <FieldLabel>{t("common.name")}</FieldLabel>
        <Input
          testID="new-bot-name"
          accessibilityLabel={t("common.name")}
          value={name()}
          placeholder="Ada"
          autoCapitalize="none"
          autoCorrect={false}
          onChange={(event) => {
            localError.set(null);
            name.set(event.value);
          }}
        />
      </Field>

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
          {t("newBot.template")}
        </Text>
        <If
          when={templates().length > 0}
          else={
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: token("muted-foreground") }}>
                {saving() ? t("newBot.readingPresets") : t("newBot.noTemplates")}
              </Text>
              <Button
                size="sm"
                disabled={writeBlocked()}
                variant="secondary"
                onPress={() => void importDshTemplates()}
              >
                {t("newBot.import")}
              </Button>
            </View>
          }
        >
          <View style={{ gap: 4 }}>
            <Each of={templates()}>
              {(template) => (
                <View
                  onPress={() => templateId.set(template().id)}
                  role="button"
                  accessibilityLabel={t("newBot.templateLabel", { name: template().name })}
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
                    borderColor: chosen()?.id === template().id ? token("brand") : token("border"),
                    backgroundColor:
                      chosen()?.id === template().id ? token("inset") : "transparent",
                  }}
                >
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: token("foreground") }}>
                      {template().name}
                    </Text>
                    <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
                      {t("newBot.templateMeta", { preset: template().presetId })}
                    </Text>
                  </View>
                  <If when={chosen()?.id === template().id}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: token("brand") }}>
                      {t("common.selected")}
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
        <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
          {t("newBot.firstDir")}
        </Text>
        <Field>
          <FieldLabel>{t("common.path")}</FieldLabel>
          <Input
            testID="new-bot-workspace"
            accessibilityLabel={t("common.path")}
            value={workspace()}
            placeholder="/Users/you/Work/project"
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => {
              localError.set(null);
              workspace.set(event.value);
            }}
          />
        </Field>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            size="sm"
            disabled={writeBlocked()}
            variant="secondary"
            onPress={() => void chooseWorkspace()}
          >
            {t("newBot.chooseFolder")}
          </Button>
        </View>
      </View>

      <If when={!!(localError() ?? actionError())}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
          {localError() ?? actionError()}
        </Text>
      </If>

      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button size="sm" variant="ghost" onPress={closeNewBot}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={!canCreate()} onPress={() => void create()}>
          {creating() ? t("newBot.creating") : t("newBot.create")}
        </Button>
      </View>
    </View>
  );
}
