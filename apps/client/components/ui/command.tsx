// Command: palette parts (`commandClasses`, `CommandRow`) and the `Command` that wears them.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, terminal } from "../../lib/theme";
import { Check, Search, type IconNode } from "lucide";
import { platform, split, Text, View } from "nsh";
import {
  Command as BaseCommand,
  type CommandEntry,
  type CommandGroup,
  type CommandItem,
  type CommandProps as BaseCommandProps,
  type CommandRef,
} from "nsh/base";

import { Kbd } from "./kbd";
import { Icon } from "../../lib/icons";
import { controlSize } from "../../lib/surface";
import { joinClass } from "../../lib/utils";

const desktop = platform.desktop;
const size = {
  row: controlSize.row,
  rowSm: desktop ? 32 : controlSize.row,
  label: controlSize.label,
  detail: controlSize.detail,
};

/** A row's label: 13 points under a pointer, a touch screen's control label. */
const labelFont = desktop ? 13 : size.label;

/**
 * The classes of a palette's parts. The highlight is a tint and an inner
 * border, both inside the row: the rows fill the list's width, whose scroll
 * view clips what reaches past its sides.
 */
export const commandClasses = {
  /** The palette's frame. */
  root: "overflow-hidden rounded-xl border border-border bg-card",
  /**
   * The row of the search icon, the field and the spinner. A terminal's
   * field is a raised band: the band spans the row, as the rows' do, and
   * its own padding sets its text where theirs starts.
   */
  searchBar: `flex-row items-center gap-2 border-b border-border ${terminal ? "" : "px-3"}`,
  /** The search field. */
  search: `flex-1 ${terminal ? "px-2 " : ""}${desktop ? "h-11 text-sm" : "h-12 text-base"} text-foreground placeholder:text-muted-foreground`,
  /**
   * The scroll view of the rows. A terminal's rows set their text off
   * the edge with their own padding, as the field does.
   */
  list: terminal ? "" : "p-1.5",
  /** A section's header. */
  group: "px-2 pt-2.5 pb-1",
  /** Between two sections. */
  separator: "-mx-1.5 my-1 h-px bg-border",
  /** A row: quiet until hovered, on `accent` while highlighted (as a list's row), dimmed while disabled. */
  item:
    "group rounded-md border border-transparent transition-colors duration-100 motion-reduce:transition-none " +
    "hover:bg-hover focus:bg-accent active:opacity-70 disabled:opacity-50",
};

/** A shortcut's keys, as hints show them here (`entry.shortcutLabel`): the library's one keycap, `kbd`'s. */
export function CommandKeys(props: { label: string }) {
  return <Kbd>{props.label}</Kbd>;
}

/** A section's heading: small capitals in the faint color. */
export function CommandHeading(props: { group: CommandGroup }) {
  return (
    // Small capitals: an 11-point header, tracked out a little to read as a label.
    <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: colors.faint }}>
      {props.group.heading.toLocaleUpperCase()}
    </Text>
  );
}

/**
 * A row's content: an icon, the label (and a `detail` under it), a `note`
 * at the end, the shortcut's keys with a pointer, and a check for the
 * item in effect. The icon and label take the brand color while
 * highlighted (`group-focus:`).
 */
export function CommandRow(props: {
  entry: CommandEntry;
  icon?: IconNode;
  detail?: string;
  note?: string;
}) {
  // A second line of text takes the row past its least height, so the row asks for density's height.
  const height = props.detail ? size.row : size.rowSm;
  return (
    <View
      style={{ height, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8 }}
    >
      {props.icon ? <Icon icon={props.icon} size={16} tint={colors.muted} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ fontSize: labelFont, color: colors.text, numberOfLines: 1 }}>
          {props.entry.label}
        </Text>
        {props.detail ? (
          <Text style={{ fontSize: size.detail, color: colors.muted, numberOfLines: 1 }}>
            {props.detail}
          </Text>
        ) : null}
      </View>
      {props.note ? (
        <Text style={{ fontSize: size.detail, color: colors.faint, fontVariant: ["tabular-nums"] }}>
          {props.note}
        </Text>
      ) : null}
      {desktop && props.entry.shortcutLabel ? (
        <CommandKeys label={props.entry.shortcutLabel} />
      ) : null}
      {props.entry.checked ? <Icon icon={Check} size={14} tint={colors.text} /> : null}
    </View>
  );
}

/** What a palette shows while nothing matches. */
export function CommandEmpty(props: { label: string }) {
  return (
    <Text style={{ paddingVertical: 24, textAlign: "center", fontSize: 13, color: colors.muted }}>
      {props.label}
    </Text>
  );
}

/** Every prop of `nsh/base` Command. */
export type CommandProps = BaseCommandProps;

/** A command of the palette (`items`), from `nsh/base`. */
export type { CommandItem };

/** A row as `renderItem` draws it: what it is, never its state, from `nsh/base`. */
export type { CommandEntry };

/** A section's header as `renderGroup` draws it, from `nsh/base`. */
export type { CommandGroup };

/** The palette's ref (`focus`, `highlight`, `matchedCount`), from `nsh/base`. */
export type { CommandRef };

/** A command palette: search field over virtualized, natively filtered rows. */
export function Command(props: CommandProps) {
  const [, rest] = split(props, [
    "class",
    "searchBarClass",
    "searchClass",
    "listClass",
    "listStyle",
    "itemClass",
    "groupClass",
    "separatorClass",
    "renderItem",
    "renderGroup",
    "empty",
    "placeholder",
    "searchPrefix",
    "style",
  ]);
  return (
    <BaseCommand
      {...rest}
      class={joinClass(commandClasses.root, props.class)}
      searchBarClass={joinClass(commandClasses.searchBar, props.searchBarClass)}
      searchClass={joinClass(commandClasses.search, props.searchClass)}
      listClass={joinClass(commandClasses.list, props.listClass)}
      itemClass={joinClass(commandClasses.item, props.itemClass)}
      groupClass={joinClass(commandClasses.group, props.groupClass)}
      separatorClass={joinClass(commandClasses.separator, props.separatorClass)}
      placeholder={props.placeholder ?? "Type a command or search…"}
      searchPrefix={
        props.searchPrefix === undefined ? (
          <Icon icon={Search} size={16} tint={colors.muted} />
        ) : (
          props.searchPrefix
        )
      }
      renderItem={
        props.renderItem === undefined ? (entry) => <CommandRow entry={entry} /> : props.renderItem
      }
      renderGroup={
        props.renderGroup === undefined
          ? (group) => <CommandHeading group={group} />
          : props.renderGroup
      }
      empty={props.empty === undefined ? <CommandEmpty label="No results." /> : props.empty}
      style={props.style}
    />
  );
}
