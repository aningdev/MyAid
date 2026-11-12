/**
 * A Navigator row's context menu: the commands that act on the Bot, Dialogue
 * or Session the row stands for. A secondary click opens it where the pointer
 * is and does not open (or select) the row; the items close over the row's
 * address, not over whatever is active.
 */
import { Text, View, type JSX } from "nsh";
import { ContextMenu, MenuItem, MenuSeparator } from "nsh/base";

import {
  archiveClaim,
  archiveDialogue,
  claimOwner,
  deleteBot,
  type Dialogue,
} from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import { openBotSettings } from "../../features/bots/settings";
import { changeRegistry, registry, setActionError } from "../../features/bots/state";
import { requestComposerFocus } from "../../features/dialogue/chat/focus";
import { createSession } from "../../features/dialogue/session/runtime";
import { colors, Icon, type IconName } from "../ui";
import { isFavorite, removeFavorite, toggleFavorite } from "./favorites";
import { dialogueSegment, sessionAddress, dialogueAddress } from "./navAddresses";
import { navAddressForId } from "./navData";
import { openNewDialogue, openRename } from "./navSheets";
import { openAddress, panelContents, setPanelAddress } from "./state";
import type { NavAddress } from "./types";

type Entry =
  | { kind: "separator"; id: string }
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: IconName;
      disabled?: boolean;
      onSelect: () => void;
    };

/** The menu items for a row, by the object its address names. */
export function contextEntries(address: NavAddress | undefined): Entry[] {
  if (!address) return [];
  switch (address.kind) {
    case "bot": {
      const bot = registry().bots.find((item) => item.id === address.botId) ?? null;
      if (!bot) return [];
      const hasDialogues = registry().dialogues.some((item) => item.botId === bot.id);
      return [
        {
          kind: "item",
          id: "bot-settings",
          label: "Bot Settings…",
          icon: "sliders",
          onSelect: () => openBotSettings(bot.id),
        },
        {
          kind: "item",
          id: "bot-new-dialogue",
          label: "New Dialogue…",
          icon: "plus",
          disabled: bot.status !== "ready",
          onSelect: () =>
            openNewDialogue({
              botId: bot.id,
              botName: bot.name,
              workspacePath: bot.defaultWorkspacePath ?? "",
            }),
        },
        { kind: "separator", id: "bot-separator" },
        {
          kind: "item",
          id: "bot-delete",
          label: "Delete Bot",
          icon: "close",
          disabled: bot.hadDialogue || hasDialogues,
          onSelect: () => void removeBot(bot.id),
        },
      ];
    }
    case "dialogue": {
      const dialogue = registry().dialogues.find((item) => item.id === address.dialogueId);
      if (!dialogue) return [];
      const bot = registry().bots.find((item) => item.id === dialogue.botId) ?? null;
      return [
        {
          kind: "item",
          id: "dialogue-new-session",
          label: "New Session",
          icon: "plus",
          disabled: dialogue.archived || bot?.status !== "ready",
          onSelect: () => void newSession(dialogue),
        },
        {
          kind: "item",
          id: "dialogue-rename",
          label: "Rename…",
          icon: "text",
          disabled: dialogue.archived,
          onSelect: () =>
            openRename({
              kind: "dialogue",
              dialogueId: dialogue.id,
              value: dialogueSegment(dialogue),
            }),
        },
        { kind: "separator", id: "dialogue-separator" },
        {
          kind: "item",
          id: "dialogue-archive",
          label: "Archive Dialogue",
          icon: "storage",
          disabled: dialogue.archived,
          onSelect: () => void removeDialogue(dialogue.id),
        },
      ];
    }
    case "session": {
      const owner = address.sessionId ? claimOwner(registry(), address.sessionId) : null;
      if (!owner) return [];
      const favorite = isFavorite(address.id);
      return [
        {
          kind: "item",
          id: "session-rename",
          label: "Rename…",
          icon: "text",
          onSelect: () =>
            openRename({
              kind: "session",
              dialogueId: owner.dialogue.id,
              sessionId: owner.claim.sessionId,
              value: sessionLabel(owner.claim, null),
            }),
        },
        {
          kind: "item",
          id: "session-favorite",
          label: favorite ? "Remove from Favorites" : "Add to Favorites",
          icon: "star",
          onSelect: () => {
            if (favorite) removeFavorite(address.id);
            else toggleFavorite(address);
          },
        },
        { kind: "separator", id: "session-separator" },
        {
          kind: "item",
          id: "session-archive",
          label: "Archive Session",
          icon: "storage",
          onSelect: () => void archiveSession(owner.dialogue, owner.claim.sessionId),
        },
      ];
    }
    default:
      return [];
  }
}

/** Wrap a row in its context menu when it has one. */
export function NavContextMenu(props: { id: string; children: JSX.Element }) {
  const address = navAddressForId(props.id);
  const entries = () => contextEntries(address);
  if (entries().length === 0) return props.children;
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
        <Text style={{ fontSize: 13, color: colors.text }}>{item.label}</Text>
      </View>
    </MenuItem>
  );
}

async function newSession(dialogue: Dialogue): Promise<void> {
  try {
    const id = await createSession(dialogue.id);
    const claim = dialogue.claims.find((item) => item.sessionId === id) ?? null;
    openAddress(
      sessionAddress({
        sessionId: id,
        label: sessionLabel(claim ?? { title: null }, null),
        botId: dialogue.botId,
        dialogueId: dialogue.id,
      }),
    );
    requestComposerFocus(id);
  } catch {
    // The runtime's sessionError names the reason in the Panel that shows it.
  }
}

async function removeBot(botId: string): Promise<void> {
  const next = await changeRegistry((registry) => deleteBot(registry, botId));
  if (!next) setActionError("This Bot cannot be deleted.");
}

async function removeDialogue(dialogueId: string): Promise<void> {
  await changeRegistry((registry) => archiveDialogue(registry, dialogueId));
}

async function archiveSession(dialogue: Dialogue, sessionId: string): Promise<void> {
  const next = await changeRegistry((registry) => archiveClaim(registry, dialogue.id, sessionId));
  if (!next) return;
  // Panels showing the archived Session fall back to its Dialogue.
  const bot = registry().bots.find((item) => item.id === dialogue.botId) ?? null;
  for (const [panelId, address] of Object.entries(panelContents())) {
    if (address?.sessionId !== sessionId) continue;
    setPanelAddress(
      panelId,
      dialogueAddress({
        id: dialogue.id,
        workspacePath: dialogue.workspacePath,
        botId: dialogue.botId,
        botName: bot?.name ?? "",
      }),
    );
  }
}
