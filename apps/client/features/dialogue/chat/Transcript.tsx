import { ArrowDown } from "lucide";
/**
 * The transcript: the library's `MessageScroller`, whose viewport follows the
 * newest message while the person is at the end and stays where they left it
 * when they are not — a `MessageScrollerButton` takes them back. It pages
 * older history in as they near the top, and holds the row they were reading
 * while a page lands above it or a reply streams below. The header's hairline
 * and the rail's jumps read what it reports.
 */
import { cleanup, platform, View, type ViewRef, type ViewStyle, token } from "nsh";

import { buttonGlyph } from "../../../components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "../../../components/ui/message-scroller";
import { Skeleton } from "../../../components/ui/skeleton";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha } from "../../../lib/theme";
import type { Bot } from "../../bots/model";
import { MessageRow, type RowHandlers } from "./MessageRow";
import { DateSeparator, SegmentDivider } from "./parts";
import type { Row } from "./rows";

type DateRow = Extract<Row, { kind: "date" }>;
type SegmentRow = Extract<Row, { kind: "segment" }>;

/** How close to the end (points) still counts as following. */
const FOLLOW_SLACK = 40;

/** How close to the top (points) asks for another page. */
const PAGE_AT = 120;

/** How far down (points) the person goes before another page may be asked for. */
const PAGE_REARM = 480;

/** What the transcript does on the Pane's word: the end, or one segment's start. */
export interface TranscriptHandle {
  /** Reveals the newest message. */
  revealEnd(animated?: boolean): void;
  /** Reveals the start of the segment with this Session, once its rows are there. */
  revealSegment(sessionId: string): void;
}

export function Transcript(props: {
  rows: () => Row[];
  botName: () => string;
  bot: () => Bot | null;
  now: () => number;
  handlers: RowHandlers;
  following: () => boolean;
  streaming: () => boolean;
  loadingOlder: () => boolean;
  onScrollState: (state: { following: boolean; scrolled: boolean }) => void;
  onLoadOlder: () => void;
  handle: (node: TranscriptHandle | undefined) => void;
}) {
  const wide = platform.idiom === "desktop";
  const column: ViewStyle = wide ? { width: "100%", maxWidth: 820, alignSelf: "center" } : {};

  // One ref per row, by id: what the Pane's jumps and the paging reveal.
  const items = new Map<string, ViewRef>();
  let pending: string | null = null;
  let armed = true;
  let lastOffset = 0;
  let lastContent = 0;

  const reveal = (id: string | undefined, vertical: "start" | "end", animated: boolean) => {
    if (!id) return;
    items.get(id)?.reveal({ vertical, animated });
  };

  const handle: TranscriptHandle = {
    revealEnd: (animated = true) => {
      const rows = props.rows();
      reveal(rows[rows.length - 1]?.id, "end", animated);
    },
    revealSegment: (sessionId) => {
      const at = props.rows().find((row) => row.kind === "segment" && row.sessionId === sessionId);
      reveal(at?.id, "start", true);
    },
  };
  props.handle(handle);
  cleanup(() => props.handle(undefined));

  const settle = (e: { offsetY: number; viewport: number; content: number }) => {
    // A scroll event that comes before the first layout (a viewport of no
    // room) says nothing about the reader's place, and would take them off
    // the newest message for good.
    if (e.viewport <= 0 || e.content <= 0) return;
    const bottom = e.content - e.offsetY - e.viewport;
    const moved = Math.abs(e.offsetY - lastOffset);
    const grew = e.content > lastContent;
    lastOffset = e.offsetY;
    lastContent = e.content;
    // The scroller moves the offset itself when it follows a growing reply:
    // only a move the person made can stop the follow.
    const following = moved < 1 && grew ? props.following() : bottom <= FOLLOW_SLACK;
    props.onScrollState({ following, scrolled: e.offsetY > 2 });

    // Older history: a page while there is one to ask for, once per approach.
    if (e.content <= e.viewport) return;
    if (props.loadingOlder()) return;
    if (e.offsetY > PAGE_REARM) armed = true;
    if (e.offsetY < PAGE_AT && armed) {
      armed = false;
      const first = props.rows()[0];
      pending = first ? first.id : null;
      props.onLoadOlder();
    }
  };

  // The place the app keeps, since the viewport has no anchoring of its own:
  // a page that landed above leaves the person on the row they were reading,
  // and a reply that grows keeps the newest one in view while it follows.
  const settlePlace = () => {
    const anchor = pending;
    if (anchor) {
      const rows = props.rows();
      if (rows[0]?.id !== anchor) {
        pending = null;
        reveal(anchor, "start", false);
      }
    }
    if (!props.following()) return;
    const rows = props.rows();
    reveal(rows[rows.length - 1]?.id, "end", false);
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View selectable style={{ flex: 1, minHeight: 0 }}>
        <MessageScroller style={{ flex: 1, minHeight: 0 }}>
          <MessageScrollerViewport
            testID="transcript"
            style={{ flex: 1 }}
            contentStyle={{ paddingHorizontal: 16 }}
            keyboardDismissMode="interactive"
            scrollEventThrottle={100}
            onScroll={(e) =>
              settle({
                offsetY: e.offset.y,
                viewport: e.size.height,
                content: e.contentSize.height,
              })
            }
          >
            <MessageScrollerContent onLayout={settlePlace} style={column}>
              <If when={props.loadingOlder()}>
                <View
                  role="progressbar"
                  accessibilityLabel={t("chat.loadingOlder")}
                  style={{ alignItems: "center", paddingVertical: 10, gap: 6 }}
                >
                  <Skeleton style={{ width: 220, height: 12 }} />
                  <Skeleton style={{ width: 180, height: 12 }} />
                </View>
              </If>
              <Each of={props.rows()} key={(row) => row.id}>
                {(row) => (
                  <MessageScrollerItem
                    // The end's 16 points live on the last row and the start's
                    // on the first: the content's own padding would leave a
                    // reveal short of the end by its height.
                    style={{
                      overflow: "hidden",
                      width: "100%",
                      paddingTop: props.rows()[0]?.id === row().id ? 16 : 0,
                      paddingBottom:
                        props.rows()[props.rows().length - 1]?.id === row().id ? 16 : 0,
                    }}
                    ref={(node) => {
                      const id = row().id;
                      if (node) items.set(id, node);
                      else items.delete(id);
                    }}
                  >
                    <If
                      when={row().kind === "segment"}
                      else={
                        <If
                          when={row().kind === "date"}
                          else={
                            <MessageRow
                              row={row}
                              botName={props.botName}
                              bot={props.bot}
                              now={props.now}
                              handlers={props.handlers}
                            />
                          }
                        >
                          <DateSeparator label={(row() as DateRow).label} />
                        </If>
                      }
                    >
                      <SegmentDivider row={row as () => SegmentRow} />
                    </If>
                  </MessageScrollerItem>
                )}
              </Each>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" accessibilityLabel={t("chat.jumpLatest")}>
            <Icon icon={ArrowDown} {...buttonGlyph("secondary", { size: "sm" })} />
            <If when={props.streaming()}>
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: token("brand"),
                  borderWidth: 2,
                  borderColor: token("background"),
                }}
              />
            </If>
          </MessageScrollerButton>
        </MessageScroller>
      </View>

      {/* A hairline over the last row while more is below it. */}
      <View
        testID="transcript-edge"
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: alpha(token("foreground"), 0.06),
          opacity: props.following() ? 0 : 1,
          transitionProperty: "opacity",
          transitionDuration: 150,
        }}
      />
    </View>
  );
}
