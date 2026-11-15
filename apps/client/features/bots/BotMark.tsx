/**
 * A Bot's identity mark: MyAid's own little character — a body in the Bot's
 * accent with two eyes cut out of it (see `avatar.ts`) — in the Navigator, the
 * Pane titles, the chat and the Bot's own screens. A Bot with a running turn
 * breathes a quiet halo around it (`animate-pulse`, still when reduced motion
 * is on); the character's own motion comes in the next batch.
 */
import { Canvas, Text, View, token, type JSX } from "nsh";

import { Pressable } from "../../components/ui/pressable";
import { t } from "../../lib/i18n";
import { alpha } from "../../lib/theme";
import { drawAvatarFrame } from "./avatar";
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
  /** A running turn under this Bot: the halo breathes. */
  working?: boolean;
  /** What screen readers say (default: the mark is decorative). */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const size = props.size ?? 22;
  const color = botColor(props.identity);
  const halo = size + 6;
  return (
    <View
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <If when={!!props.working}>
        {/* A slow arc around the character: motion without a second badge. */}
        <View
          testID="bot-mark-working"
          class="animate-spin motion-reduce:animate-none"
          style={{
            position: "absolute",
            left: -3,
            top: -3,
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            borderWidth: 1.5,
            borderColor: alpha(color, 0.18),
            borderTopColor: alpha(color, 0.9),
            borderRightColor: alpha(color, 0.5),
          }}
        />
      </If>
      <BotAvatar identity={props.identity} size={size} />
    </View>
  );
}

/**
 * The character itself: the body in its accent, the eyes cut out of it. It
 * redraws when the identity it reads changes, so a picker's preview follows
 * every press.
 */
export function BotAvatar(props: { identity: Live<BotIdentity>; size?: number }) {
  const size = props.size ?? 22;
  const read = (): BotIdentity =>
    typeof props.identity === "function" ? props.identity() : props.identity;
  return (
    <Canvas
      style={{ pointerEvents: "none", width: size, height: size }}
      draw={(cx, { width }) => {
        const identity = read();
        drawAvatarFrame(cx, {
          shape: identity.shape,
          face: identity.face,
          color: botColor(identity),
          size: width,
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
