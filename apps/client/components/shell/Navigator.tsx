/**
 * Navigator: the flat Bot list under its search field.
 *
 * Pinned Bots first, the rest by recent activity, then "New Bot"; an archived
 * Bot shows only in a search, with the way back. A row opens the Bot's Pane
 * (or brings it to the front), a secondary click offers its verbs, and a drag
 * to the right drops it into the Workbench as a new Pane.
 */
import { keymap, platform, Scroll, Text, View, type InputRef } from "nsh";
import { Button, Input } from "nsh/base";

import { BotMark } from "../../features/bots/BotMark";
import { unarchiveBot } from "../../features/bots/model";
import { openNewBot } from "../../features/bots/newBot";
import { changeRegistry, registry } from "../../features/bots/state";
import { colors, hovered, Icon, Press, radius } from "../ui";
import { type BotRow, botRows } from "./botList";
import { navSearchFocusRequest, navQuery, setNavQuery, takeNavSearchFocus } from "./navFilter";
import { NavContextMenu } from "./navMenu";
import { activeBotId, dropBot, openBot } from "./state";

/** The row a drag just dropped, so its cancelled press opens nothing too. */
let dropped: string | null = null;

export function Navigator() {
  let search: InputRef | undefined;

  // ⌘F / View › Search Navigator: the field takes the keyboard, and the
  // Navigator opens if it was folded away.
  if (navSearchFocusRequest() > 0) {
    takeNavSearchFocus();
    search?.focus();
  }

  const empty = () => {
    const list = botRows();
    return list.pinned.length === 0 && list.others.length === 0 && list.archived.length === 0;
  };

  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.inset }}>
      <View style={{ paddingHorizontal: 6, paddingTop: 6, paddingBottom: 2, gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            height: 30,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Icon name="search" size={13} tint={colors.muted} />
          <Input
            ref={(node) => (search = node ?? undefined)}
            testID="nav-search"
            accessibilityLabel="Search Bots"
            value={navQuery()}
            placeholder="Search…"
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => setNavQuery(event.value)}
            style={{
              flex: 1,
              height: 28,
              fontSize: 13,
              color: colors.text,
              paddingHorizontal: 0,
              placeholderColor: colors.faint,
            }}
          />
          <If when={!!navQuery()}>
            <Button
              onPress={() => setNavQuery("")}
              accessibilityLabel="Clear search"
              class="hover:bg-accent size-5 items-center justify-center rounded"
            >
              <Icon name="close" size={11} tint={colors.muted} />
            </Button>
          </If>
        </View>
      </View>
      <Scroll style={{ flex: 1 }} contentStyle={{ paddingHorizontal: 6, paddingBottom: 6 }}>
        <If when={botRows().pinned.length > 0}>
          <GroupHeader label="Pin" first />
          <Each of={botRows().pinned} key={(row) => row.bot.id}>
            {(row) => <Row row={row()} />}
          </Each>
        </If>
        <If when={botRows().pinned.length > 0 && botRows().others.length > 0}>
          <View
            style={{
              height: 1,
              marginTop: 6,
              marginBottom: 5,
              marginHorizontal: 6,
              backgroundColor: colors.line,
            }}
          />
        </If>
        <Each of={botRows().others} key={(row) => row.bot.id}>
          {(row) => <Row row={row()} />}
        </Each>
        <If when={botRows().archived.length > 0}>
          <GroupHeader
            label="Archived"
            first={botRows().pinned.length === 0 && botRows().others.length === 0}
          />
          <Each of={botRows().archived} key={(row) => row.bot.id}>
            {(row) => <Row row={row()} />}
          </Each>
        </If>
        <If when={empty() && !!navQuery().trim()}>
          <Text
            style={{ paddingHorizontal: 6, paddingVertical: 8, fontSize: 12, color: colors.muted }}
          >
            No Bots match.
          </Text>
        </If>
        <If when={empty() && !navQuery().trim()}>
          <Text
            style={{ paddingHorizontal: 6, paddingVertical: 8, fontSize: 12, color: colors.muted }}
          >
            {registry().bots.length > 0
              ? "Every Bot is archived. Search for one to bring it back."
              : "No Bots yet."}
          </Text>
        </If>
        <NewBotRow />
      </Scroll>
    </View>
  );
}

/** A small muted group label ("Pin", "Archived"), with room above it unless it leads. */
function GroupHeader(props: { label: string; first?: boolean }) {
  const first = () => props.first === true;
  return (
    <View
      style={{
        height: 24 + (first() ? 2 : 8),
        paddingTop: first() ? 2 : 8,
        paddingHorizontal: 6,
        justifyContent: "center",
      }}
    >
      <Text
        class="text-muted-foreground"
        style={{
          fontSize: platform.idiom === "desktop" ? 11 : 13,
          fontWeight: "600",
          numberOfLines: 1,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}

/** One Bot: its mark (breathing while it works), its name and its live marks. */
function Row(props: { row: BotRow }) {
  const row = () => props.row;
  const bot = () => row().bot;
  const selected = () => activeBotId() === bot().id;

  const open = () => {
    if (dropped === bot().id) {
      dropped = null;
      return;
    }
    openBot(bot().id);
  };

  return (
    <NavContextMenu bot={bot()}>
      <View
        role="button"
        onPress={open}
        accessibilityLabel={bot().name}
        accessibilityState={{ selected: selected() }}
        activeStyle={{ backgroundColor: colors.raised }}
        hoverStyle={hovered()}
        onPressDown={() => {
          // A press after a drop starts a fresh gesture: the drop is done.
          if (dropped === bot().id) dropped = null;
        }}
        tooltip={<Text style={{ fontSize: 11 }}>Drag right to open beside the active Pane</Text>}
        onPanEnd={(event) => {
          if (event.cancelled) return;
          // A drag to the right leaves the list and lands in the Pane area.
          if (event.translation.x < 40 || Math.abs(event.translation.y) > 120) return;
          dropped = bot().id;
          dropBot(bot().id);
        }}
        style={{
          width: "100%",
          minHeight: platform.idiom === "desktop" ? 30 : 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 6,
          paddingVertical: 3,
          borderRadius: radius.control,
          backgroundColor: selected() ? colors.raised : "transparent",
        }}
      >
        <BotMark identity={bot().identity} size={18} working={row().working} />
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: platform.idiom === "desktop" ? 13 : 15,
            color: bot().archived ? colors.muted : colors.text,
            numberOfLines: 1,
          }}
        >
          {bot().name}
        </Text>
        <StatusMarks row={row()} />
        <If when={bot().archived}>
          <Unarchive botId={bot().id} name={bot().name} />
        </If>
      </View>
    </NavContextMenu>
  );
}

/** Working dot, unread count, waiting approval: the row's live marks. */
function StatusMarks(props: { row: BotRow }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <If when={props.row.attention}>
        <Dot testID="nav-status-attention" label="Waiting for approval" color={colors.warn} />
      </If>
      <If when={props.row.working}>
        <Dot testID="nav-status-working" label="Working" color={colors.up} />
      </If>
      <If when={props.row.unread > 0}>
        <View
          testID="nav-status-unread"
          accessibilityLabel={`${props.row.unread} unread`}
          style={{
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accentFill,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.onAccent }}>
            {String(props.row.unread)}
          </Text>
        </View>
      </If>
    </View>
  );
}

function Dot(props: { testID: string; label: string; color: string }) {
  return (
    <View
      testID={props.testID}
      accessibilityLabel={props.label}
      style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: props.color }}
    />
  );
}

function Unarchive(props: { botId: string; name: string }) {
  return (
    <Press
      onPress={() => void unarchive(props.botId)}
      accessibilityLabel={`Unarchive ${props.name}`}
      scale={0.96}
      style={{ paddingHorizontal: 6, paddingVertical: 2 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.accent }}>Unarchive</Text>
    </Press>
  );
}

async function unarchive(botId: string): Promise<void> {
  await changeRegistry((registry) => unarchiveBot(registry, botId));
}

/** The list's last row: the one way to make another Bot. */
function NewBotRow() {
  return (
    <View
      role="button"
      onPress={openNewBot}
      accessibilityLabel="New Bot"
      hoverStyle={hovered()}
      activeStyle={{ backgroundColor: colors.raised }}
      style={{
        minHeight: platform.idiom === "desktop" ? 30 : 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 4,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: radius.control,
      }}
    >
      <View style={{ width: 18, height: 18, alignItems: "center", justifyContent: "center" }}>
        <Icon name="plus" size={13} tint={colors.muted} />
      </View>
      <Text
        style={{ flex: 1, fontSize: platform.idiom === "desktop" ? 13 : 15, color: colors.muted }}
      >
        New Bot
      </Text>
      <Text style={{ fontSize: 11, color: colors.faint }}>{keymap.label("mod+n") ?? ""}</Text>
    </View>
  );
}
