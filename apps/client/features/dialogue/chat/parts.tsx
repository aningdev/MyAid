/**
 * The small pieces a transcript row is made of: the spinner, the streaming
 * caret, a reply's action buttons, a day's and a segment's `Marker`, a file
 * chip, a photo, the error row and the bot's avatar.
 */
import { File, type IconNode, RotateCw, Sparkles, TriangleAlert, X } from "lucide";
import { Image, type JSX, Text, View, token } from "nsh";

import { Alert, AlertDescription, ALERT_ICON } from "../../../components/ui/alert";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  attachmentGlyph,
} from "../../../components/ui/attachment";
import { Button } from "../../../components/ui/button";
import { Marker, MarkerContent } from "../../../components/ui/marker";
import { Pressable } from "../../../components/ui/pressable";
import { TooltipContent, tooltipText } from "../../../components/ui/tooltip";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha, finish, mono, radius, toneColor, toneTint, type Tone } from "../../../lib/theme";
import { BotMark } from "../../bots/BotMark";
import type { BotIdentity } from "../../bots/identity";
import type { FileRef } from "./scripts";

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
    <Marker variant="separator" style={{ paddingHorizontal: 4 }}>
      {props.label}
    </Marker>
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
    <Marker
      variant="separator"
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
      style={{ paddingHorizontal: 4 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "78%" }}>
        <MarkerContent>{row().label}</MarkerContent>
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
    </Marker>
  );
}

/** A file a message carries: its glyph, its name and its weight. */
export function FileChip(props: { file: FileRef }) {
  return (
    <Attachment state="done" size="sm">
      <AttachmentMedia>
        <Icon
          icon={File}
          size={attachmentGlyph("sm", "horizontal")}
          tint={token("muted-foreground")}
        />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle style={{ maxWidth: 170 }}>{props.file.name}</AttachmentTitle>
        <AttachmentDescription>
          {`${(props.file.name.split(".").pop() ?? "file").toUpperCase()} · ${props.file.size}`}
        </AttachmentDescription>
      </AttachmentContent>
    </Attachment>
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

/** The reply's error: what went wrong and a Retry button under it. */
export function ErrorRow(props: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <Icon icon={TriangleAlert} size={ALERT_ICON} tint={token("destructive")} />
      <AlertDescription>
        <Text style={{ fontSize: 13, lineHeight: 18, color: token("foreground") }}>
          {props.message}
        </Text>
        <Button
          size="sm"
          variant="ghost"
          onPress={props.onRetry}
          accessibilityLabel={t("chat.retry")}
        >
          {t("common.retry")}
        </Button>
      </AlertDescription>
    </Alert>
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
