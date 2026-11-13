/**
 * The small pieces a transcript row is made of: the spinner, the streaming
 * caret, a reply's action buttons, a day separator, a file chip, a photo,
 * the error row and the bot's avatar.
 */
import { Image, type JSX, Text, View } from "nsh";

import { Icon } from "../../../components/ui";
import {
  alpha,
  colors,
  finish,
  mono,
  Press,
  radius,
  type Tone,
  toneColor,
  toneTint,
} from "../../../components/ui";
import { BotMark } from "../../bots/BotMark";
import type { BotIdentity } from "../../bots/identity";
import { Glyph, type GlyphName } from "./glyphs";
import type { FileRef } from "./scripts";

/** A ring that spins natively (the built-in `spin` keyframes). */
export function Spinner(props: { size?: number; tint?: string }) {
  const size = props.size ?? 14;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: colors.border,
        borderTopColor: props.tint ?? colors.accent,
        animationName: "spin",
        animationDuration: 800,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
      }}
    />
  );
}

/** The streaming caret: an inline block that pulses natively. */
export function Caret() {
  return (
    <View
      style={{
        width: 8,
        height: 16,
        marginLeft: 2,
        borderRadius: 2,
        backgroundColor: colors.accent,
        animationName: "pulse",
        animationDuration: 900,
        animationIterationCount: "infinite",
      }}
    />
  );
}

/** A small icon button under a reply (44 pt touch target). */
export function ActionButton(props: {
  glyph: GlyphName;
  label: string;
  active?: boolean;
  tone?: Tone;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={props.onPress}
      scale={0.86}
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.active }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          margin: 4,
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: props.active ? toneTint(props.tone ?? "accent") : "transparent",
            transitionProperty: "colors",
            transitionDuration: 180,
          }}
        />
        <Glyph
          name={props.glyph}
          size={17}
          tint={props.active ? toneColor(props.tone ?? "accent") : colors.muted}
        />
      </View>
    </Press>
  );
}

/** A row between days. */
export function DateSeparator(props: { label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 4,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.faint }}>{props.label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

/** The line between two segments of one long conversation: date · directory. */
export function SegmentDivider(props: {
  row: () => {
    label: string;
    path: string;
    fullPath: string;
    current: boolean;
    sessionId: string;
  };
}) {
  const row = () => props.row();
  return (
    <View
      testID="segment-divider"
      accessibilityLabel={`Segment ${row().label}${row().fullPath ? `, ${row().fullPath}` : ""}${row().current ? ", current" : ""}`}
      tooltip={
        row().fullPath ? (
          <Text style={{ fontSize: 12, userSelect: "text" }}>{row().fullPath}</Text>
        ) : undefined
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 4,
        paddingTop: 18,
        paddingBottom: 8,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "78%" }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>{row().label}</Text>
        <If when={!!row().path}>
          <Text
            testID={`segment-path-${row().sessionId}`}
            style={{
              flexShrink: 1,
              fontSize: 11,
              color: colors.faint,
              fontFamily: mono,
              numberOfLines: 1,
            }}
          >
            {`· ${row().path}`}
          </Text>
        </If>
        <If when={row().current}>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.accent,
            }}
          />
        </If>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

/** A file as a chip: an icon, the name and the size. */
export function FileChip(props: { file: FileRef; onRemove?: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        height: 44,
        paddingStart: 8,
        paddingEnd: props.onRemove ? 2 : 12,
        borderRadius: radius.control,
        borderCurve: "continuous",
        backgroundColor: colors.raised,
        ...finish.raised,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: toneTint("danger"),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Glyph name="file" size={15} tint={colors.danger} />
      </View>
      <View style={{ gap: 1 }}>
        <Text style={{ numberOfLines: 1, maxWidth: 170, fontSize: 13, color: colors.text }}>
          {props.file.name}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted, fontVariant: ["tabular-nums"] }}>
          {(props.file.name.split(".").pop() ?? "file").toUpperCase()} · {props.file.size}
        </Text>
      </View>
      <If when={props.onRemove}>
        <Press onPress={props.onRemove} accessibilityLabel="Remove file" scale={0.85}>
          <View style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Glyph name="close" size={13} tint={colors.muted} />
          </View>
        </Press>
      </If>
    </View>
  );
}

/** An attached image, rounded. */
export function Photo(props: {
  src: string;
  width: number;
  height: number;
  children?: JSX.Element;
}) {
  return (
    <View
      style={{
        width: props.width,
        height: props.height,
        borderRadius: radius.inset,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.raised,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Image src={props.src} style={{ width: props.width, height: props.height }} />
      {props.children}
    </View>
  );
}

/** The reply's error: what went wrong and a Retry button. */
export function ErrorRow(props: { message: string; onRetry: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: radius.inset,
        borderCurve: "continuous",
        backgroundColor: toneTint("danger"),
        borderWidth: 1,
        borderColor: alpha(colors.danger, 0.32),
      }}
    >
      <Glyph name="alert" size={16} tint={colors.danger} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.text }}>
        {props.message}
      </Text>
      <Press onPress={props.onRetry} accessibilityLabel="Retry">
        <View
          style={{
            height: 30,
            paddingHorizontal: 12,
            borderRadius: 15,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: colors.light,
            ...finish.light,
          }}
        >
          <Glyph name="regenerate" size={13} tint={colors.onLight} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onLight }}>Retry</Text>
        </View>
      </Press>
    </View>
  );
}

/** The bot's avatar: a small tile with the spark. */
export function Avatar(props: { identity?: BotIdentity | null; working?: boolean }) {
  if (props.identity)
    return <BotMark identity={props.identity} size={22} working={props.working} />;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.raised,
        ...finish.raised,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name="spark" size={12} tint={colors.accent} />
    </View>
  );
}
