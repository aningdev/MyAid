/**
 * The Navigator's rename dialog, mounted once by the shell: it writes the
 * Bot's name in the registry, and every Pane title and list row follows.
 */
import { effect, signal, Text, View, token } from "nsh";

import { openBotDetails } from "../../features/bots/details";
import { updateBot } from "../../features/bots/model";
import { actionError, changeRegistry, registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { closeRename, renameTarget } from "./navDialogs";

const DIALOG_WIDTH = 460;

/** The Navigator's forms, each its own dialog. */
export function NavigatorDialogs() {
  // Overlay components: an array keeps them from taking layout space.
  return [<RenameDialog />];
}

function RenameDialog() {
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
    const next = value().trim();
    if (!current || busy()) return;
    if (!next) {
      failure.set(t("rename.needsName"));
      return;
    }
    busy.set(true);
    failure.set(null);
    try {
      const saved = await changeRegistry((registry) =>
        updateBot(registry, current.botId, { name: next }),
      );
      if (!saved) {
        failure.set(actionError() ?? t("rename.saveFailed"));
        return;
      }
      closeRename();
    } finally {
      busy.set(false);
    }
  };

  const details = () => {
    const current = target();
    if (!current) return;
    closeRename();
    openBotDetails(current.botId);
  };

  return (
    <Dialog
      open={target() !== null}
      onOpenChange={({ open: next }) => {
        if (!next) closeRename();
      }}
    >
      <DialogContent width={DIALOG_WIDTH} accessibilityLabel={t("rename.title")}>
        <If when={target()}>
          {(current) => (
            <View style={{ gap: 12 }} testID="rename-dialog">
              <DialogTitle>{t("rename.title")}</DialogTitle>
              <Field>
                <FieldLabel>{t("rename.name")}</FieldLabel>
                <Input
                  testID="rename-name"
                  accessibilityLabel={t("rename.name")}
                  value={value()}
                  placeholder={
                    registry().bots.find((bot) => bot.id === current().botId)?.name ?? "Ada"
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChange={(event) => {
                    failure.set(null);
                    value.set(event.value);
                  }}
                />
              </Field>
              <If when={!!failure()}>
                <Text style={{ fontSize: 12, color: token("destructive") }}>{failure()}</Text>
              </If>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                <Button size="sm" variant="ghost" onPress={details}>
                  {t("menu.botDetails")}
                </Button>
                <Button size="sm" variant="ghost" onPress={closeRename}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" disabled={busy()} onPress={() => void save()}>
                  {busy() ? t("common.saving") : t("common.save")}
                </Button>
              </View>
            </View>
          )}
        </If>
      </DialogContent>
    </Dialog>
  );
}
