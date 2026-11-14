import { effect, signal, Text, View, windowSize, token } from "nsh";

import { openBotDetails } from "../../features/bots/details";
import { updateBot } from "../../features/bots/model";
import { actionError, changeRegistry, registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { Button } from "../ui/button";
/**
 * The Navigator's rename sheet, mounted once by the shell: it writes the
 * Bot's name in the registry, and every Pane title and list row follows.
 */
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Sheet, SheetContent } from "../ui/sheet";
import { closeRename, renameTarget } from "./navSheets";

const SHEET_WIDTH = 460;

export function NavigatorSheets() {
  // Overlay components: an array keeps them from taking layout space.
  return [<RenameSheet />];
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
    <Sheet
      open={target() !== null}
      onOpenChange={({ open: next }) => {
        if (!next) closeRename();
      }}
    >
      <SheetContent
        side="top"
        popupStyle={{
          width: SHEET_WIDTH,
          marginLeft: Math.max(0, (windowSize().width - SHEET_WIDTH) / 2),
        }}
      >
        <If when={target()}>
          {(current) => (
            <View style={{ gap: 12 }} testID="rename-sheet">
              <Text style={{ fontSize: 17, fontWeight: "600", color: token("foreground") }}>
                {t("rename.title")}
              </Text>
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
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={details}
                  accessibilityLabel={t("menu.botDetails")}
                >
                  {t("menu.botDetails")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={closeRename}
                  accessibilityLabel={t("common.cancel")}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={busy()}
                  onPress={() => void save()}
                  accessibilityLabel={busy() ? t("common.saving") : t("common.save")}
                >
                  {busy() ? t("common.saving") : t("common.save")}
                </Button>
              </View>
            </View>
          )}
        </If>
      </SheetContent>
    </Sheet>
  );
}
