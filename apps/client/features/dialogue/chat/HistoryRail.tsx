/**
 * The long conversation's history rail: a scrollbar-like strip on the right
 * edge with one mark per segment (oldest at the top), the current segment
 * highlighted. Hovering a mark names the segment and its time; pressing it
 * jumps to the start of that segment. The rail is one keyboard stop: ↑ / ↓
 * move the mark, Return jumps. Every mark carries a VoiceOver label.
 */
import { cleanup, effect, keymap, signal, Text, View } from "nsh";

import { alpha, colors } from "../../../components/ui";

export type RailMark = {
  sessionId: string;
  /** The person's name for the segment, or the first prompt's summary. */
  label: string;
  /** "Today 14:05" — what hover and VoiceOver say. */
  time: string;
  /** The directory it ran in, for the label. */
  path: string;
  current: boolean;
};

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
      keymap.bind(
        "return",
        () => {
          if (!focused()) return;
          const index = cursor();
          if (index >= 0) choose(index);
        },
        { when: "always" },
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
      accessibilityLabel="Conversation history"
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
          <View
            testID={`history-mark-${index()}`}
            role="option"
            focusable={false}
            accessibilityLabel={`${mark().label} · ${mark().time}${mark().path ? ` · ${mark().path}` : ""}${mark().current ? " · current" : ""}`}
            accessibilityState={{ selected: mark().current }}
            onPress={() => choose(index())}
            tooltip={
              <View style={{ gap: 2, maxWidth: 280 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>
                  {mark().label}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>{mark().time}</Text>
                <If when={!!mark().path}>
                  <Text style={{ fontSize: 11, color: colors.faint }}>{mark().path}</Text>
                </If>
              </View>
            }
            style={{
              width: 14,
              height: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              testID={`history-mark-${mark().sessionId}`}
              style={{
                width: mark().current ? 4 : 3,
                height: mark().current ? 14 : 8,
                borderRadius: 2,
                backgroundColor: mark().current
                  ? colors.accent
                  : cursor() === index() && focused()
                    ? colors.muted
                    : alpha(colors.text, 0.2),
                transitionProperty: "background-color",
                transitionDuration: 120,
              }}
            />
          </View>
        )}
      </Each>
    </View>
  );
}
