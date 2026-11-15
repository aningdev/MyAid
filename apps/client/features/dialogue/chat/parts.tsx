/**
 * The small pieces a transcript row is made of: the spinner, the streaming
 * caret, a reply's action buttons, a day separator, a file chip, a photo,
 * the error row and the bot's avatar.
 */
import { File, type IconNode, RotateCw, Sparkles, TriangleAlert, X } from "lucide";
import { Image, type JSX, Text, View, token } from "nsh";

import { Button } from "../../../components/ui/button";
import { Pressable } from "../../../components/ui/pressable";
import { Separator } from "../../../components/ui/separator";
import { TooltipContent, tooltipText } from "../../../components/ui/tooltip";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha, finish, mono, radius, toneColor, toneTint, type Tone } from "../../../lib/theme";
import { BotMark } from "../../bots/BotMark";
import type { BotIdentity } from "../../bots/identity";
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
        borderColor: token("border"),
        borderTopColor: props.tint ?? token("brand"),
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
        backgroundColor: token("brand"),
        animationName: "pulse",
        animationDuration: 900,
        animationIterationCount: "infinite",
      }}
    />
  );
}

/** A small icon button under a reply (44 pt touch target). */
export function ActionButton(props: {
  glyph: IconNode;
  label: string;
  active?: boolean;
  tone?: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={props.onPress} accessibilityLabel={props.label} selected={props.active}>
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
        <Icon
          icon={props.glyph}
          size={17}
          tint={props.active ? toneColor(props.tone ?? "accent") : token("muted-foreground")}
        />
      </View>
    </Pressable>
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
      <Separator style={{ flex: 1, width: "auto" }} />
      <Text style={{ fontSize: 11, fontWeight: "500", color: token("faint") }}>{props.label}</Text>
      <Separator style={{ flex: 1, width: "auto" }} />
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
      accessibilityLabel={`${t("chat.segmentDivider", { label: row().label })}${
        row().fullPath ? `, ${row().fullPath}` : ""
      }${row().current ? `, ${t("chat.current")}` : ""}`}
      tooltip={
        row().fullPath ? (
          <TooltipContent>
            <Text class={tooltipText} style={{ userSelect: "text" }}>
              {row().fullPath}
            </Text>
          </TooltipContent>
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
      <Separator style={{ flex: 1, width: "auto" }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "78%" }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: token("muted-foreground") }}>
          {row().label}
        </Text>
        <If when={!!row().path}>
          <Text
            testID={`segment-path-${row().sessionId}`}
            style={{
              flexShrink: 1,
              fontSize: 11,
              color: token("faint"),
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
              backgroundColor: token("brand"),
            }}
          />
        </If>
      </View>
      <Separator style={{ flex: 1, width: "auto" }} />
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
        backgroundColor: token("raised"),
        ...finish.raised,
        borderWidth: 1,
        borderColor: token("border"),
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
        <Icon icon={File} size={15} tint={token("destructive")} />
      </View>
      <View style={{ gap: 1 }}>
        <Text style={{ numberOfLines: 1, maxWidth: 170, fontSize: 13, color: token("foreground") }}>
          {props.file.name}
        </Text>
        <Text
          style={{ fontSize: 11, color: token("muted-foreground"), fontVariant: ["tabular-nums"] }}
        >
          {(props.file.name.split(".").pop() ?? "file").toUpperCase()} · {props.file.size}
        </Text>
      </View>
      <If when={props.onRemove}>
        <Pressable onPress={props.onRemove} accessibilityLabel={t("chat.removeFile")} hitSlop={6}>
          <View style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Icon icon={X} size={13} tint={token("muted-foreground")} />
          </View>
        </Pressable>
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
        backgroundColor: token("raised"),
        borderWidth: 1,
        borderColor: token("border"),
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
        borderColor: alpha(token("destructive"), 0.32),
      }}
    >
      <Icon icon={TriangleAlert} size={16} tint={token("destructive")} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: token("foreground") }}>
        {props.message}
      </Text>
      <Button onPress={props.onRetry} accessibilityLabel={t("chat.retry")}>
        <Icon icon={RotateCw} size={13} tint={token("primary-foreground")} />
        {t("common.retry")}
      </Button>
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
        backgroundColor: token("raised"),
        ...finish.raised,
        borderWidth: 1,
        borderColor: token("border"),
      }}
    >
      <Icon icon={Sparkles} size={12} tint={token("brand")} />
    </View>
  );
}
