/**
 * A Bot row's context menu: the verbs of that Bot (and not of whatever Pane
 * has the focus). A secondary click opens it where the pointer is and does not
 * open the row.
 */
import { Archive, SlidersHorizontal, Sparkles, Star, Type } from "lucide";
import { type IconNode } from "lucide";
import { Text, type JSX } from "nsh";

import { openBotDetails } from "../../features/bots/details";
import { isMainBot, type Bot } from "../../features/bots/model";
import { archiveBot, unarchiveBot } from "../../features/bots/state";
import { t, type MessageKey } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { menuItemGlyph, menuItemLabel } from "../ui/menu";
import { openRename } from "./navDialogs";
import { isPinned, togglePin } from "./pins";

type Entry =
  | { kind: "separator"; id: string }
  | {
      kind: "item";
      id: string;
      label: MessageKey;
      icon?: IconNode;
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
      icon: Star,
      onSelect: () => togglePin(bot.id),
    },
    {
      kind: "item",
      id: "bot-details",
      label: "menu.botDetails",
      icon: SlidersHorizontal,
      onSelect: () => openBotDetails(bot.id),
    },
    {
      kind: "item",
      id: "bot-rename",
      label: "menu.rename",
      icon: Type,
      onSelect: () => openRename({ botId: bot.id, value: bot.name }),
    },
    ...(isMainBot(bot)
      ? []
      : [
          { kind: "separator" as const, id: "bot-separator" },
          bot.archived
            ? {
                kind: "item" as const,
                id: "bot-unarchive",
                label: "menu.unarchive" as const,
                icon: Archive,
                onSelect: () => void setArchived(bot.id, false),
              }
            : {
                kind: "item" as const,
                id: "bot-archive",
                label: "menu.archive" as const,
                icon: Archive,
                onSelect: () => void setArchived(bot.id, true),
              },
        ]),
  ];
}

async function setArchived(botId: string, archived: boolean): Promise<void> {
  if (archived) await archiveBot(botId);
  else await unarchiveBot(botId);
}

/** Wrap a Bot row in its context menu. */
export function NavContextMenu(props: { bot: Bot; children: JSX.Element }) {
  const entries = () => contextEntries(props.bot, { pinned: isPinned(props.bot.id) });
  return (
    <ContextMenu>
      <ContextMenuTrigger style={{ minWidth: 0, flex: 1 }}>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <Each of={entries()} key={(entry) => entry.id}>
          {(entry) => <EntryItem entry={entry()} />}
        </Each>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function EntryItem(props: { entry: Entry }) {
  const item = props.entry;
  if (item.kind === "separator") return <ContextMenuSeparator />;
  return (
    <ContextMenuItem disabled={item.disabled === true} onSelect={item.onSelect}>
      <Icon icon={item.icon ?? Sparkles} {...menuItemGlyph()} />
      <Text style={menuItemLabel()}>{t(item.label)}</Text>
    </ContextMenuItem>
  );
}
