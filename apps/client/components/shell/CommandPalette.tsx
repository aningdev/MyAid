/**
 * ⌘K: one palette over everything the shell can do and everywhere it can go.
 * The rows come from the command table and the registry (`commands.ts`), so
 * a command is not written twice; the `Command` of shadcn-nsh owns filtering,
 * the keyboard and what screen readers hear.
 */
import { effect, keymap, signal, Text, token, View } from "nsh";

import { Command, CommandEmpty, CommandRow } from "../../components/ui/command";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { t } from "../../lib/i18n";
import {
  closeCommandPalette,
  commandPaletteOpen,
  paletteIcon,
  paletteItems,
  runPaletteItem,
  toggleCommandPalette,
} from "./commands";

export function CommandPalette() {
  const open = () => commandPaletteOpen();
  const query = signal("");
  const highlighted = signal<string | null>(null);

  // Each opening starts from a fresh query; the next Escape closes.
  let wasOpen = false;
  effect(() => {
    const next = open();
    if (next && !wasOpen) {
      query.set("");
      highlighted.set(null);
    }
    wasOpen = next;
  });

  // ⌘K toggles from anywhere, the palette included. This binding is made
  // after the shell's, so it is the one that fires for the key.
  keymap.bind("mod+k", toggleCommandPalette, { when: "always" });

  const choose = (id: string) => {
    runPaletteItem(id);
    closeCommandPalette();
  };

  return (
    <Dialog
      open={open()}
      onCancel={closeCommandPalette}
      onOpenChange={({ open: next }) => {
        if (!next) closeCommandPalette();
      }}
    >
      <DialogContent width={560} accessibilityLabel={t("palette.title")} style={{ padding: 0 }}>
        <If when={open()}>
          <Command
            testID="command-palette"
            items={paletteItems().items}
            query={query()}
            onQueryChange={({ query: next }) => query.set(next)}
            onCancel={closeCommandPalette}
            onSelect={({ id }) => choose(id)}
            onHighlightChange={({ highlighted: next }) => highlighted.set(next)}
            autoFocus
            placeholder={t("palette.placeholder")}
            accessibilityLabel={t("palette.label")}
            searchAccessibilityLabel={t("palette.searchLabel")}
            listClass="max-h-96"
            renderItem={(entry) => <CommandRow entry={entry} icon={paletteIcon(entry.id)} />}
            empty={<CommandEmpty label={t("palette.nothing")} />}
            footer={
              <View
                class="border-border flex-row items-center gap-4 border-t px-3"
                style={{ height: 36 }}
              >
                <Hint keys={["↑", "↓"]} label={t("palette.move")} />
                <Hint keys={["↩"]} label={t("palette.open")} />
                <Hint keys={["Esc"]} label={t("palette.close")} />
                <Text style={{ flex: 1 }} />
                <Text style={{ fontSize: 11, color: token("faint") }}>
                  {highlighted() ? labelOf(highlighted()!) : ""}
                </Text>
              </View>
            }
          />
        </If>
      </DialogContent>
    </Dialog>
  );
}

/** A hint: the stroke's keys, then what they do. */
function Hint(props: { keys: string[]; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <KbdGroup>
        {props.keys.map((key) => (
          <Kbd>{key}</Kbd>
        ))}
      </KbdGroup>
      <Text style={{ fontSize: 11, color: token("faint") }}>{props.label}</Text>
    </View>
  );
}

function labelOf(id: string): string {
  return paletteItems().items.find((item) => item.id === id)?.label ?? "";
}
