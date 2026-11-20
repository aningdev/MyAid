import { Plus, Search, X } from "lucide";
/**
 * Navigator: the flat Bot list under its search field.
 *
 * Pinned Bots first, then the rest in the Registry's order (the plugin keeps
 * the Main Bot first), then "New Bot"; an archived Bot shows only in a search,
 * with the way back. A row opens the Bot's Pane
 * (or brings it to the front), a secondary click offers its verbs, and a drag
 * to the right drops it into the Workbench as a new Pane.
 */
import { effect, platform, Scroll, Text, token, View, type InputRef } from "nsh";

import { Shortcut } from "../../components/app";
import { BotMark } from "../../features/bots/BotMark";
import { openNewBot } from "../../features/bots/newBot";
import { registry, unarchiveBot } from "../../features/bots/state";
import { t, tCount } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { hovered, radius } from "../../lib/theme";
import { buttonGlyph } from "../ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "../ui/input-group";
import { Pressable } from "../ui/pressable";
import { Separator } from "../ui/separator";
import { TooltipContent } from "../ui/tooltip";
import { type BotRow, botRows } from "./botList";
import { navSearchFocusRequest, navQuery, setNavQuery, takeNavSearchFocus } from "./navFilter";
import { NavContextMenu } from "./navMenu";
import { activeBotId, dropBot, openBot } from "./state";

/** The row a drag just dropped, so its cancelled press opens nothing too. */
let dropped: string | null = null;

export function Navigator() {
  let search: InputRef | undefined;

  // ⌘F / View › Search Navigator: the field takes the keyboard, and the
  // Navigator opens if it was folded away. The request is taken once the field
  // is made (an effect runs after the tree is), and only the one it was for.
  effect(() => {
    if (navSearchFocusRequest() === 0) return;
    if (!takeNavSearchFocus()) return;
    search?.focus();
  });

  const empty = () => {
    const list = botRows();
    return list.pinned.length === 0 && list.others.length === 0 && list.archived.length === 0;
  };

  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: token("inset") }}>
      <View style={{ paddingHorizontal: 6, paddingTop: 6, paddingBottom: 2, gap: 4 }}>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <Icon icon={Search} size={13} tint={token("muted-foreground")} />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            ref={(node) => (search = node ?? undefined)}
            testID="nav-search"
            accessibilityLabel={t("nav.searchLabel")}
            value={navQuery()}
            placeholder={t("nav.searchPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => setNavQuery(event.value)}
            style={{ flex: 1, fontSize: 13 }}
          />
          <If when={!!navQuery()}>
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onPress={() => setNavQuery("")}
                accessibilityLabel={t("nav.clearSearch")}
              >
                <Icon icon={X} {...buttonGlyph("ghost", { size: "sm" })} />
              </InputGroupButton>
            </InputGroupAddon>
          </If>
        </InputGroup>
      </View>
      <Scroll style={{ flex: 1 }} contentStyle={{ paddingHorizontal: 6, paddingBottom: 6 }}>
        <If when={botRows().pinned.length > 0}>
          <GroupHeader label={t("nav.pin")} first />
          <Each of={botRows().pinned} key={(row) => row.bot.id}>
            {(row) => <Row row={row()} />}
          </Each>
        </If>
        <If when={botRows().pinned.length > 0 && botRows().others.length > 0}>
          <Separator
            style={{
              width: "auto",
              marginTop: 6,
              marginBottom: 5,
              marginHorizontal: 6,
            }}
          />
        </If>
        <Each of={botRows().others} key={(row) => row.bot.id}>
          {(row) => <Row row={row()} />}
        </Each>
        <If when={botRows().archived.length > 0}>
          <GroupHeader
            label={t("nav.archived")}
            first={botRows().pinned.length === 0 && botRows().others.length === 0}
          />
          <Each of={botRows().archived} key={(row) => row.bot.id}>
            {(row) => <Row row={row()} />}
          </Each>
        </If>
        <If when={empty() && !!navQuery().trim()}>
          <Text
            style={{
              paddingHorizontal: 6,
              paddingVertical: 8,
              fontSize: 12,
              color: token("muted-foreground"),
            }}
          >
            {t("nav.noMatch")}
          </Text>
        </If>
        <If when={empty() && !navQuery().trim()}>
          <Text
            style={{
              paddingHorizontal: 6,
              paddingVertical: 8,
              fontSize: 12,
              color: token("muted-foreground"),
            }}
          >
            {registry().bots.length > 0 ? t("nav.allArchived") : t("nav.noBots")}
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
        activeStyle={{ backgroundColor: token("raised") }}
        hoverStyle={hovered()}
        onPressDown={() => {
          // A press after a drop starts a fresh gesture: the drop is done.
          if (dropped === bot().id) dropped = null;
        }}
        tooltip={<TooltipContent>{t("nav.dragHint")}</TooltipContent>}
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
          backgroundColor: selected() ? token("raised") : "transparent",
        }}
      >
        <BotMark identity={bot().identity} size={18} working={row().working} />
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: platform.idiom === "desktop" ? 13 : 15,
            color: bot().archived ? token("muted-foreground") : token("foreground"),
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
        <Dot testID="nav-status-attention" label={t("nav.waitingApproval")} color={token("warn")} />
      </If>
      <If when={props.row.working}>
        <Dot testID="nav-status-working" label={t("nav.working")} color={token("up")} />
      </If>
      <If when={props.row.unread > 0}>
        <View
          testID="nav-status-unread"
          accessibilityLabel={tCount("nav.unread.one", "nav.unread.other", props.row.unread)}
          style={{
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: token("brand-fill"),
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "600", color: token("on-brand") }}>
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
    <Pressable
      onPress={() => void unarchive(props.botId)}
      accessibilityLabel={t("nav.unarchiveBot", { name: props.name })}
      hitSlop={10}
      style={{ paddingHorizontal: 6, paddingVertical: 2 }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: token("brand") }}>
        {t("common.unarchive")}
      </Text>
    </Pressable>
  );
}

async function unarchive(botId: string): Promise<void> {
  await unarchiveBot(botId);
}

/** The list's last row: the one way to make another Bot. */
function NewBotRow() {
  return (
    <View
      role="button"
      onPress={openNewBot}
      accessibilityLabel={t("nav.newBot")}
      hoverStyle={hovered()}
      activeStyle={{ backgroundColor: token("raised") }}
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
        <Icon icon={Plus} size={13} tint={token("muted-foreground")} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: platform.idiom === "desktop" ? 13 : 15,
          color: token("muted-foreground"),
        }}
      >
        {t("nav.newBot")}
      </Text>
      <Shortcut keystroke="mod+n" />
    </View>
  );
}
