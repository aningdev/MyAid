/**
 * The long conversation's history rail: a scrollbar-like strip on the right
 * edge with one mark per segment (oldest at the top), the current segment
 * highlighted. Hovering a mark opens a card with the segment's title, time and
 * directory; pressing it jumps to the start of that segment. The rail is one
 * keyboard stop: ↑ / ↓ move the mark, Return jumps. Every mark carries a
 * VoiceOver label with the full path.
 */
import { cleanup, effect, keymap, signal, Text, View, token } from "nsh";
import { HoverCard } from "nsh/base";

import { t } from "../../../lib/i18n";
import { alpha, mono, radius } from "../../../lib/theme";
import { middleEllipsis } from "../../workspace/paths";

export type RailMark = {
  sessionId: string;
  /** The person's name for the segment, or the first prompt's summary. */
  label: string;
  /** "Today 14:05" — what hover and VoiceOver say. */
  time: string;
  /** The directory as the transcript reads it (`~/…` under home). */
  path: string;
  /** The canonical directory, for the label and the card's full value. */
  fullPath: string;
  current: boolean;
};

/** The card's surface: the app's popup family, not a bare text bubble. */
function cardStyle() {
  return {
    backgroundColor: token("popover"),
    borderColor: token("border"),
    borderWidth: 1,
    borderCurve: "continuous" as const,
    borderRadius: radius.control,
    padding: 10,
    gap: 5,
    minWidth: 180,
    maxWidth: 300,
  };
}

/** What a mark says to a screen reader: its title, time, path and whether it is current. */
function markLabel(mark: RailMark): string {
  return `${mark.label} · ${mark.time}${mark.fullPath ? ` · ${mark.fullPath}` : ""}${mark.current ? ` · ${t("chat.current")}` : ""}`;
}

export function HistoryRail(props: { marks: () => RailMark[]; onJump: (index: number) => void }) {
  const focused = signal(false);
  const cursor = signal(-1);

  // A shorter conversation leaves the cursor at its last mark.
  effect(() => {
    const count = props.marks().length;
    if (count === 0) cursor.set(-1);
    else if (cursor() >= count) cursor.set(count - 1);
  });

  const move = (delta: number) => {
    const count = props.marks().length;
    if (count === 0) return;
    const start = cursor() < 0 ? count - 1 : cursor();
    cursor.set(Math.max(0, Math.min(count - 1, start + delta)));
  };

  const choose = (index: number) => {
    cursor.set(index);
    props.onJump(index);
  };

  effect(() => {
    const off = [
      keymap.bind(
        "up",
        () => {
          if (focused()) move(-1);
        },
        { when: "always", passThrough: true },
      ),
      keymap.bind(
        "down",
        () => {
          if (focused()) move(1);
        },
        { when: "always", passThrough: true },
      ),
      // The rail's Return jumps the transcript; a text input keeps its own
      // Return (the composer sends on it), so this must not claim it while one
      // is editing.
      keymap.bind(
        "return",
        () => {
          if (!focused()) return;
          const index = cursor();
          if (index >= 0) choose(index);
        },
        { when: "notEditing" },
      ),
    ];
    cleanup(() => {
      for (const remove of off) remove();
    });
  });

  return (
    <View
      testID="history-rail"
      role="listbox"
      accessibilityLabel={t("chat.history")}
      focusable
      onPress={() => {
        if (cursor() < 0) cursor.set(props.marks().length - 1);
      }}
      onFocus={() => {
        focused.set(true);
        if (cursor() < 0) cursor.set(props.marks().length - 1);
      }}
      onBlur={() => focused.set(false)}
      style={{
        position: "absolute",
        top: 56,
        right: 2,
        bottom: 124,
        width: 20,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        gap: 5,
      }}
    >
      <Each of={props.marks()} key={(mark) => mark.sessionId}>
        {(mark, index) => (
          <HoverCard
            placement="left"
            align="center"
            offset={8}
            openDelay={120}
            closeDelay={180}
            popupStyle={cardStyle()}
            trigger={
              <View
                testID={`history-mark-${index()}`}
                role="option"
                focusable={false}
                accessibilityLabel={markLabel(mark())}
                accessibilityState={{ selected: mark().current }}
                onPress={() => choose(index())}
                style={{
                  width: 14,
                  height: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  testID={
                    mark().current
                      ? `history-current-${mark().sessionId}`
                      : `history-past-${mark().sessionId}`
                  }
                  style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}
                >
                  <View
                    testID={`history-mark-${mark().sessionId}`}
                    style={{
                      width: mark().current ? 4 : 3,
                      height: mark().current ? 14 : 8,
                      borderRadius: 2,
                      backgroundColor: mark().current
                        ? token("brand")
                        : cursor() === index() && focused()
                          ? token("muted-foreground")
                          : alpha(token("foreground"), 0.2),
                      transitionProperty: "background-color",
                      transitionDuration: 120,
                    }}
                  />
                </View>
              </View>
            }
          >
            <View testID="rail-card" accessibilityLabel={markLabel(mark())} style={{ gap: 4 }}>
              <Text
                testID="rail-card-title"
                style={{
                  numberOfLines: 1,
                  fontSize: 12,
                  fontWeight: "600",
                  color: token("foreground"),
                }}
              >
                {mark().label}
              </Text>
              <Text
                testID="rail-card-time"
                style={{
                  fontSize: 11,
                  color: token("muted-foreground"),
                  fontVariant: ["tabular-nums"],
                }}
              >
                {mark().time}
              </Text>
              <If when={!!mark().path}>
                <Text
                  testID="rail-card-path"
                  style={{
                    fontSize: 11,
                    color: token("faint"),
                    fontFamily: mono,
                    numberOfLines: 1,
                  }}
                >
                  {middleEllipsis(mark().path, 42)}
                </Text>
              </If>
            </View>
          </HoverCard>
        )}
      </Each>
    </View>
  );
}
