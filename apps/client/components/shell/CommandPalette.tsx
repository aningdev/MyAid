/**
 * ⌘K: one palette over everything the shell can do and everywhere it can go.
 * The rows come from the command table and the registry (`commands.ts`), so
 * a command is not written twice; the `Command` of `nsh/base` owns filtering,
 * the keyboard and what screen readers hear.
 */
import { Check, Search } from "lucide";
import { effect, keymap, signal, Text, View, token } from "nsh";
import { Command, Dialog, type CommandEntry } from "nsh/base";

import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { alpha, radius } from "../../lib/theme";
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
      animation="fade"
      accessibilityLabel={t("palette.title")}
      onCancel={closeCommandPalette}
      onOpenChange={({ open: next }) => {
        if (!next) closeCommandPalette();
      }}
      backdropStyle={{ backgroundColor: alpha(token("foreground"), 0.28) }}
      style={{
        marginHorizontal: "auto",
        marginTop: "12%",
        width: 560,
        maxWidth: "92%",
      }}
    >
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
          style={paletteCardStyle()}
          searchBarClass="flex-row items-center gap-2 border-b border-border px-3"
          searchClass="h-11 flex-1 text-sm"
          searchStyle={{
            color: token("foreground"),
            placeholderColor: token("faint"),
            caretColor: token("brand"),
          }}
          listClass="max-h-96 p-1.5"
          groupClass="px-2 pt-2.5 pb-1"
          itemClass="group rounded-md border border-transparent transition-colors duration-100 motion-reduce:transition-none hover:bg-accent focus:border-ring/40 focus:bg-accent active:opacity-80 disabled:opacity-40"
          separatorClass="-mx-1.5 my-1 h-px bg-border"
          searchPrefix={<Icon icon={Search} size={16} tint={token("muted-foreground")} />}
          empty={
            <Text
              style={{
                paddingVertical: 24,
                textAlign: "center",
                fontSize: 13,
                color: token("muted-foreground"),
              }}
            >
              {t("palette.nothing")}
            </Text>
          }
          renderGroup={(group) => (
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.6,
                color: token("faint"),
              }}
            >
              {group.heading.toLocaleUpperCase()}
            </Text>
          )}
          renderItem={(entry) => <PaletteRow entry={entry} />}
          footer={
            <View
              class="flex-row items-center gap-4 border-t px-3"
              style={{ height: 32, borderTopColor: token("line") }}
            >
              <Hint label={t("palette.hintMove")} />
              <Hint label={t("palette.hintOpen")} />
              <Hint label={t("palette.hintClose")} />
              <Text style={{ flex: 1 }} />
              <Hint label={highlighted() ? labelOf(highlighted()!) : ""} />
            </View>
          }
        />
      </If>
    </Dialog>
  );
}

function PaletteRow(props: { entry: CommandEntry }) {
  return (
    <View
      style={{
        height: 34,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 8,
      }}
    >
      <Icon icon={paletteIcon(props.entry.id)} size={16} tint={token("muted-foreground")} />
      <Text
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          color: token("foreground"),
          numberOfLines: 1,
        }}
      >
        {props.entry.label}
      </Text>
      <If when={props.entry.shortcutLabel}>
        <View
          style={{
            height: 20,
            paddingHorizontal: 6,
            justifyContent: "center",
            borderRadius: 4,
            borderWidth: 1,
            borderColor: token("border"),
            backgroundColor: token("raised"),
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: token("muted-foreground"),
              fontVariant: ["tabular-nums"],
            }}
          >
            {props.entry.shortcutLabel}
          </Text>
        </View>
      </If>
      <If when={props.entry.checked}>
        <Icon icon={Check} size={14} tint={token("foreground")} />
      </If>
    </View>
  );
}

function Hint(props: { label: string }) {
  return <Text style={{ fontSize: 11, color: token("faint") }}>{props.label}</Text>;
}

function labelOf(id: string): string {
  return paletteItems().items.find((item) => item.id === id)?.label ?? "";
}

/** The palette's own card look, read in the render's reactive scope. */
function paletteCardStyle() {
  return {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: token("border"),
    backgroundColor: token("popover"),
  };
}
