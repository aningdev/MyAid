/**
 * A Bot row's context menu: the verbs of that Bot (and not of whatever Pane
 * has the focus). A secondary click opens it where the pointer is and does not
 * open the row.
 */
import { Text, View, type JSX } from "nsh";
import { ContextMenu, MenuItem, MenuSeparator } from "nsh/base";

import { openBotDetails } from "../../features/bots/details";
import { archiveBot, type Bot, unarchiveBot } from "../../features/bots/model";
import { changeRegistry } from "../../features/bots/state";
import { t, type MessageKey } from "../../lib/i18n";
import { colors, Icon, type IconName } from "../ui";
import { openRename } from "./navSheets";
import { isPinned, togglePin } from "./pins";

type Entry =
  | { kind: "separator"; id: string }
  | {
      kind: "item";
      id: string;
      label: MessageKey;
      icon?: IconName;
      disabled?: boolean;
      onSelect: () => void;
    };

/** The menu items for one Bot. */
export function contextEntries(bot: Bot | null, options: { pinned: boolean }): Entry[] {
  if (!bot) return [];
  return [
    {
      kind: "item",
      id: "bot-pin",
      label: options.pinned ? "menu.unpin" : "menu.pin",
      icon: "star",
      onSelect: () => togglePin(bot.id),
    },
    {
      kind: "item",
      id: "bot-details",
      label: "menu.botDetails",
      icon: "sliders",
      onSelect: () => openBotDetails(bot.id),
    },
    {
      kind: "item",
      id: "bot-rename",
      label: "menu.rename",
      icon: "text",
      onSelect: () => openRename({ botId: bot.id, value: bot.name }),
    },
    { kind: "separator", id: "bot-separator" },
    bot.archived
      ? {
          kind: "item",
          id: "bot-unarchive",
          label: "menu.unarchive",
          icon: "storage",
          onSelect: () => void setArchived(bot.id, false),
        }
      : {
          kind: "item",
          id: "bot-archive",
          label: "menu.archive",
          icon: "storage",
          onSelect: () => void setArchived(bot.id, true),
        },
  ];
}

async function setArchived(botId: string, archived: boolean): Promise<void> {
  await changeRegistry((registry) =>
    archived ? archiveBot(registry, botId) : unarchiveBot(registry, botId),
  );
}

/** Wrap a Bot row in its context menu. */
export function NavContextMenu(props: { bot: Bot; children: JSX.Element }) {
  const entries = () => contextEntries(props.bot, { pinned: isPinned(props.bot.id) });
  return (
    <ContextMenu
      class="min-w-0 flex-1"
      trigger={props.children}
      popupClass="min-w-44 rounded-lg border border-border bg-popover p-1"
    >
      <Each of={entries()} key={(entry) => entry.id}>
        {(entry) => <EntryItem entry={entry()} />}
      </Each>
    </ContextMenu>
  );
}

function EntryItem(props: { entry: Entry }) {
  const item = props.entry;
  if (item.kind === "separator") {
    return <MenuSeparator class="bg-border my-1 h-px" />;
  }
  return (
    <MenuItem
      class="hover:bg-accent rounded px-2 py-1.5 disabled:opacity-40"
      disabled={item.disabled === true}
      onSelect={item.onSelect}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <If when={!!item.icon}>
          <Icon name={item.icon ?? "spark"} size={14} tint={colors.muted} />
        </If>
        <Text style={{ fontSize: 13, color: colors.text }}>{t(item.label)}</Text>
      </View>
    </MenuItem>
  );
}
