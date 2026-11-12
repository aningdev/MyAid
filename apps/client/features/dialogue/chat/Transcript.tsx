/**
 * The transcript: a virtualized list that follows the newest message while
 * the person is at the end, stops following when they scroll up (a "jump to
 * latest" pill comes back), pages older history in as they near the top, and
 * keeps its position while a reply streams. The header's hairline and the
 * pill read what it reports.
 */
import {
  createAnimatedValue,
  effect,
  reduceMotion,
  type ListRef,
  List,
  platform,
  Text,
  View,
  type ViewStyle,
} from "nsh";

import { alpha, colors, motion, RoundButton } from "../../../components/ui";
import type { Bot } from "../../bots/model";
import { MessageRow, type RowHandlers } from "./MessageRow";
import { DateSeparator } from "./parts";
import type { Row } from "./rows";

type DateRow = Extract<Row, { kind: "date" }>;

/** How close to the end (points) still counts as following. */
const FOLLOW_SLACK = 40;

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
  onJump: () => void;
  listRef: (node: ListRef | undefined) => void;
}) {
  const wide = platform.idiom === "desktop";
  const column: ViewStyle = wide ? { width: "100%", maxWidth: 820, alignSelf: "center" } : {};
  const jump = createAnimatedValue(0);
  effect(() => {
    const to = props.following() ? 0 : 1;
    if (reduceMotion()) jump.set(to);
    else void jump.spring(to, motion.settle);
  });

  // Growth moves the offset down while the list stays at the end; a scroll
  // up moves it back. Only a move the person made can stop following, so a
  // streaming reply never drops the follow by itself.
  let lastOffset = 0;
  const report = (state: { offsetY: number; viewport: number; content: number }) => {
    const atEnd = state.offsetY + state.viewport >= state.content - FOLLOW_SLACK;
    const moved = state.offsetY - lastOffset;
    lastOffset = state.offsetY;
    const following = Math.abs(moved) < 4 ? props.following() : atEnd;
    props.onScrollState({ following, scrolled: state.offsetY > 2 });
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View selectable style={{ flex: 1, minHeight: 0 }}>
        <List
          ref={props.listRef}
          each={props.rows()}
          keyExtractor={(row) => row.id}
          testID="transcript"
          estimatedItemSize={120}
          initialScrollAtEnd
          style={{ flex: 1 }}
          contentStyle={{ paddingTop: 6, paddingBottom: 10, paddingHorizontal: 16 }}
          keyboardDismissMode="interactive"
          maintainVisibleContentPosition={{ autoscrollToBottomThreshold: FOLLOW_SLACK }}
          scrollEventThrottle={100}
          onScroll={(event) =>
            report({
              offsetY: event.offset.y,
              viewport: event.size.height,
              content: event.contentSize.height,
            })
          }
          onLoadMoreAtStart={props.onLoadOlder}
          loadMoreAtStartThreshold={1}
          header={() => (
            <If when={props.loadingOlder()}>
              <View style={{ alignItems: "center", paddingVertical: 10 }}>
                <Text style={{ fontSize: 12, color: colors.faint }}>Loading older messages…</Text>
              </View>
            </If>
          )}
        >
          {(row) => (
            <View style={{ width: "100%", overflow: "hidden", ...column }}>
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
            </View>
          )}
        </List>
      </View>

      {/* Jump to the latest message: there while the list is scrolled up. */}
      <If when={!props.following()}>
        <View
          style={{
            position: "absolute",
            right: wide ? 24 : 16,
            bottom: 10,
            opacity: jump,
            transform: [{ scale: jump.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
          }}
        >
          <RoundButton
            icon="arrow-down"
            label="Jump to the latest message"
            variant="secondary"
            onPress={props.onJump}
          />
          <If when={props.streaming()}>
            <View
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.accent,
                borderWidth: 2,
                borderColor: colors.background,
              }}
            />
          </If>
        </View>
      </If>

      {/* A hairline over the last row while more is below it. */}
      <View
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: alpha(colors.text, 0.06),
          opacity: props.following() ? 0 : 1,
          transitionProperty: "opacity",
          transitionDuration: 150,
        }}
      />
    </View>
  );
}
