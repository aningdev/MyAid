/**
 * A Bot's identity mark: its accent color and glyph in a rounded tile. The
 * glyphs are MyAid's own simple shapes (a star, an orbit, a prism…), drawn
 * in the accent; no character art. A Bot with a running turn breathes a
 * quiet halo around it (`animate-pulse`, still when reduced motion is on).
 */
import { Canvas, type CanvasRenderingContext2D, Text, View } from "nsh";

import { alpha, colors } from "../../components/ui";
import { t } from "../../lib/i18n";
import {
  BOT_COLOR_HEX,
  BOT_COLOR_LABELS,
  BOT_COLORS,
  BOT_GLYPHS,
  botColor,
  type BotColor,
  type BotGlyph as BotGlyphName,
  type BotIdentity,
} from "./identity";

export function BotMark(props: {
  identity: BotIdentity;
  size?: number;
  /** A running turn under this Bot: the halo breathes. */
  working?: boolean;
  /** What screen readers say (default: the color and glyph are decorative). */
  accessibilityLabel?: string;
  testID?: string;
}) {
  const size = props.size ?? 22;
  const color = botColor(props.identity);
  const radius = Math.round(size * 0.3);
  return (
    <View
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <If when={!!props.working}>
        {/* A slow arc around the mark: motion without a second badge. */}
        <View
          testID="bot-mark-working"
          class="animate-spin motion-reduce:animate-none"
          style={{
            position: "absolute",
            left: -3,
            top: -3,
            width: size + 6,
            height: size + 6,
            borderRadius: radius + 3,
            borderCurve: "continuous",
            borderWidth: 1.5,
            borderColor: alpha(color, 0.18),
            borderTopColor: alpha(color, 0.9),
            borderRightColor: alpha(color, 0.5),
            backgroundColor: alpha(color, 0.05),
          }}
        />
      </If>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          borderCurve: "continuous",
          backgroundColor: alpha(color, 0.16),
          borderWidth: 1,
          borderColor: alpha(color, 0.38),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BotGlyph identity={props.identity} size={Math.round(size * 0.62)} />
      </View>
    </View>
  );
}

/** The glyph of an identity, in its accent. */
export function BotGlyph(props: { identity: BotIdentity; size?: number }) {
  const size = props.size ?? 14;
  const color = botColor(props.identity);
  return (
    <Canvas
      style={{ pointerEvents: "none", width: size, height: size }}
      draw={(cx, { width }) => {
        cx.save();
        cx.scale(width / 20, width / 20);
        cx.strokeStyle = color;
        cx.fillStyle = color;
        cx.lineWidth = 1.9;
        cx.lineCap = "round";
        cx.lineJoin = "round";
        glyphs[props.identity.glyph](cx);
        cx.restore();
      }}
    />
  );
}

/** The mark's color and glyph, chosen in a row: one color per accent, then the shapes. */
export function BotIdentityPicker(props: {
  identity: () => BotIdentity;
  onChange: (identity: BotIdentity) => void;
}) {
  const current = () => props.identity();
  const chooseColor = (color: BotColor) => props.onChange({ ...current(), color });
  const chooseGlyph = (glyph: BotGlyphName) => props.onChange({ ...current(), glyph });
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
          {t("bot.identity.color")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Each of={BOT_COLORS}>
            {(color) => {
              const selected = () => current().color === color();
              return (
                <View
                  onPress={() => chooseColor(color())}
                  role="button"
                  accessibilityLabel={t("bot.identity.colorLabel", {
                    name: t(BOT_COLOR_LABELS[color()]),
                  })}
                  accessibilityState={{ selected: selected() }}
                  testID={`bot-color-${color()}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderColor: selected() ? colors.text : "transparent",
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
                </View>
              );
            }}
          </Each>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
          {t("bot.identity.glyph")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Each of={BOT_GLYPHS}>
            {(glyph) => {
              const selected = () => current().glyph === glyph();
              return (
                <View
                  onPress={() => chooseGlyph(glyph())}
                  role="button"
                  accessibilityLabel={t("bot.identity.glyphLabel", { name: glyph() })}
                  accessibilityState={{ selected: selected() }}
                  testID={`bot-glyph-${glyph()}`}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    borderCurve: "continuous",
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: selected() ? botColor(current()) : colors.border,
                    backgroundColor: selected() ? alpha(botColor(current()), 0.14) : colors.raised,
                  }}
                >
                  <BotGlyph identity={{ ...current(), glyph: glyph() }} size={17} />
                </View>
              );
            }}
          </Each>
        </View>
      </View>
    </View>
  );
}

/** Line drawings in a 20 × 20 box, stroked or filled in the accent. */
type Draw = (cx: CanvasRenderingContext2D) => void;

const glyphs: Record<BotGlyphName, Draw> = {
  // A four-point star: the mark that says "this is an agent", drawn as one.
  spark: (c) => {
    c.beginPath();
    c.moveTo(10, 2.8);
    c.quadraticCurveTo(11.4, 8.6, 17.2, 10);
    c.quadraticCurveTo(11.4, 11.4, 10, 17.2);
    c.quadraticCurveTo(8.6, 11.4, 2.8, 10);
    c.quadraticCurveTo(8.6, 8.6, 10, 2.8);
    c.closePath();
    c.stroke();
  },
  // A planet and its moon: a circle with a dot on an orbit.
  orbit: (c) => {
    c.beginPath();
    c.ellipse(10, 10, 8, 3.6, -0.5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(10, 10, 3.4, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(15.2, 6.2, 1.5, 0, Math.PI * 2);
    c.fill();
  },
  // A triangle with its upright: a prism.
  prism: (c) => {
    c.beginPath();
    c.moveTo(10, 3);
    c.lineTo(17, 16);
    c.lineTo(3, 16);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(10, 3);
    c.lineTo(10, 16);
    c.stroke();
  },
  // Two arcs, a window opening.
  arc: (c) => {
    c.beginPath();
    c.arc(10, 15, 8, Math.PI * 1.18, Math.PI * 1.82);
    c.stroke();
    c.beginPath();
    c.arc(10, 15, 4.6, Math.PI * 1.14, Math.PI * 1.86);
    c.stroke();
    c.beginPath();
    c.arc(10, 15, 1.2, 0, Math.PI * 2);
    c.fill();
  },
  // One wave: a signal moving through.
  wave: (c) => {
    c.beginPath();
    c.moveTo(2.6, 12.6);
    c.bezierCurveTo(5.2, 4.6, 8, 4.6, 10, 10.2);
    c.bezierCurveTo(12, 15.8, 14.8, 15.2, 17.4, 7.2);
    c.stroke();
  },
  // Four petals around a center.
  petal: (c) => {
    for (const [x, y] of [
      [10, 5.6],
      [14.4, 10],
      [10, 14.4],
      [5.6, 10],
    ]) {
      c.beginPath();
      c.ellipse(x, y, 2.7, 2.7, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath();
    c.arc(10, 10, 1.1, 0, Math.PI * 2);
    c.fill();
  },
  // A bolt: a turn that arrives at once.
  bolt: (c) => {
    c.beginPath();
    c.moveTo(11.6, 2.8);
    c.lineTo(5.2, 11);
    c.lineTo(9.4, 11);
    c.lineTo(8.4, 17.2);
    c.lineTo(14.8, 9);
    c.lineTo(10.6, 9);
    c.closePath();
    c.stroke();
  },
  // Two strands crossing: a weave.
  weave: (c) => {
    c.beginPath();
    c.moveTo(4, 16);
    c.lineTo(16, 4);
    c.stroke();
    c.beginPath();
    c.moveTo(4, 4);
    c.lineTo(16, 16);
    c.stroke();
    c.beginPath();
    c.arc(10, 10, 2.1, 0, Math.PI * 2);
    c.stroke();
  },
};
