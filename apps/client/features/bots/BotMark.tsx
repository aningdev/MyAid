/**
 * A Bot's identity mark: dsh-bot's own little character — a body in the Bot's
 * accent with two eyes cut out of it (see `avatar.ts`) — in the Navigator, the
 * Pane titles, the chat and the Bot's own screens.
 *
 * It moves as a small creature does, and only as much as it means: at rest it
 * blinks now and then and its gaze drifts a little; with a turn of its Bot
 * running it breathes, looks about and blinks more often; a change of form in
 * the picker morphs rather than cuts. Every mark in the app is served by one
 * clock (`avatarClock.ts`), and reduced motion holds them all still.
 */
import { Canvas, effect, reduceMotion, Text, View, token, type JSX } from "nsh";

import { Pressable } from "../../components/ui/pressable";
import { t } from "../../lib/i18n";
import { avatarMotion, drawAvatarFrame, markSeed, type AvatarFormChange } from "./avatar";
import { avatarTime, watchAvatar } from "./avatarClock";
import { formBook } from "./avatarMorph";
import {
  BOT_COLOR_HEX,
  BOT_COLOR_LABELS,
  BOT_COLORS,
  BOT_FACE_LABELS,
  BOT_FACES,
  BOT_SHAPE_LABELS,
  BOT_SHAPES,
  botColor,
  type BotIdentity,
} from "./identity";

/** An identity, or a reader of it where the mark is drawn (a signal's value). */
type Live<T> = T | (() => T);

export function BotMark(props: {
  identity: BotIdentity;
  size?: number;
  /** A turn of this Bot's is running: the character works, and says so. */
  working?: boolean;
  /** What screen readers say (default: the mark is decorative). */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const size = props.size ?? 22;
  const working = () => props.working === true;
  return (
    <View
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <If when={working()}>
        {/*
         * The working mark's state layer: it exists only while a turn runs.
         * The character's own motion says what is happening — no second badge
         * around it — and this carries the state to the screens' tests and to
         * anything that looks for the mark at work.
         */}
        <View
          testID="bot-mark-working"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: size,
            height: size,
            pointerEvents: "none",
          }}
        />
      </If>
      <BotAvatar identity={props.identity} size={size} working={working()} />
    </View>
  );
}

/**
 * The character itself: the body in its accent, the eyes cut out of it, moving
 * on the app's one clock. It redraws when the identity it reads changes, so a
 * picker's preview follows every press — and morphs into the new form rather
 * than cutting to it.
 */
export function BotAvatar(props: {
  identity: Live<BotIdentity>;
  size?: number;
  /** A turn of this Bot's is running: the character works. */
  working?: boolean;
  /**
   * A moment to draw instead of the clock's, in milliseconds. A still picture
   * (a contact sheet, a test's frame) sets it; it asks the clock for nothing,
   * so a sheet of them is as still as it looks.
   */
  time?: number;
  /**
   * A step of a change of form to draw instead of one the mark remembers, from
   * 0 (its old form) to 1 (the identity's own). A still picture of a morph sets
   * it; the mark's own changes come from what it was drawn as before.
   */
  from?: AvatarFormChange;
}) {
  const size = props.size ?? 22;
  const read = (): BotIdentity =>
    typeof props.identity === "function" ? props.identity() : props.identity;
  // One mark, one wish for frames: the clock answers them all with one loop,
  // and sleeps between the moments this one actually moves.
  if (props.time === undefined)
    effect(() =>
      watchAvatar({
        working: () => props.working === true,
        motion: (time) =>
          avatarMotion({ time, working: props.working === true, seed: markSeed(read()) }),
      }),
    );
  const book = formBook();
  return (
    <Canvas
      style={{ pointerEvents: "none", width: size, height: size }}
      draw={(cx, { width }) => {
        const identity = read();
        const time = props.time ?? avatarTime();
        drawAvatarFrame(cx, {
          shape: identity.shape,
          face: identity.face,
          color: botColor(identity),
          size: width,
          time,
          working: props.working === true,
          seed: markSeed(identity),
          from: props.from ?? book.at(identity, time, reduceMotion()),
        });
      }}
    />
  );
}

/**
 * The mark's three choices in a column: the accent, the body's shape and the
 * face. The shape and face cells draw the character in the accent in effect,
 * so a press shows what the mark becomes.
 */
export function BotIdentityPicker(props: {
  identity: () => BotIdentity;
  onChange: (identity: BotIdentity) => void;
}) {
  const current = () => props.identity();
  const choose = (change: Partial<BotIdentity>) => props.onChange({ ...current(), ...change });
  return (
    <View style={{ gap: 12 }}>
      <Row title={t("bot.identity.color")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Each of={BOT_COLORS}>
            {(color) => {
              const selected = () => current().color === color();
              return (
                <Pressable
                  onPress={() => choose({ color: color() })}
                  accessibilityLabel={t("bot.identity.colorLabel", {
                    name: t(BOT_COLOR_LABELS[color()]),
                  })}
                  selected={selected()}
                  testID={`bot-color-${color()}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderColor: selected() ? token("foreground") : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: BOT_COLOR_HEX[color()],
                    }}
                  />
                </Pressable>
              );
            }}
          </Each>
        </View>
      </Row>
      <Row title={t("bot.identity.shape")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Each of={BOT_SHAPES}>
            {(shape) => {
              const selected = () => current().shape === shape();
              return (
                <Cell
                  selected={selected()}
                  label={t("bot.identity.shapeLabel", { name: t(BOT_SHAPE_LABELS[shape()]) })}
                  testID={`bot-shape-${shape()}`}
                  onPress={() => choose({ shape: shape() })}
                >
                  <BotAvatar identity={() => ({ ...current(), shape: shape() })} size={26} />
                </Cell>
              );
            }}
          </Each>
        </View>
      </Row>
      <Row title={t("bot.identity.face")}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Each of={BOT_FACES}>
            {(face) => {
              const selected = () => current().face === face();
              return (
                <Cell
                  selected={selected()}
                  label={t("bot.identity.faceLabel", { name: t(BOT_FACE_LABELS[face()]) })}
                  testID={`bot-face-${face()}`}
                  onPress={() => choose({ face: face() })}
                >
                  <BotAvatar identity={() => ({ ...current(), face: face() })} size={26} />
                </Cell>
              );
            }}
          </Each>
        </View>
      </Row>
    </View>
  );
}

/** One titled line of the picker. */
function Row(props: { title: string; children: JSX.Element }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}

/** A candidate to pick: the character drawn in it, the accent's outline when chosen. */
function Cell(props: {
  selected: boolean;
  label: string;
  testID: string;
  onPress: () => void;
  children: JSX.Element;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      selected={props.selected}
      testID={props.testID}
      style={{
        width: 36,
        height: 36,
        borderRadius: 11,
        borderCurve: "continuous",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: props.selected ? token("foreground") : token("border"),
        backgroundColor: token("raised"),
      }}
    >
      {props.children}
    </Pressable>
  );
}
