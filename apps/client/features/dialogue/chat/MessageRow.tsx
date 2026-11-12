/**
 * One transcript row: the person's message (a compact bubble with its
 * attachments), the bot's reply (reasoning, tool steps, Markdown, actions),
 * or the working row while a turn runs. A row is recycled by the list, so it
 * reads its message through `row()` and keeps no state of its own; the
 * expansion the person chose lives in the Pane.
 */
import { signal, Text, View } from "nsh";

import { Badge, colors, finish, Press } from "../../../components/ui";
import { ImageViewer } from "../ImageViewer";
import { Glyph } from "./glyphs";
import { Markdown } from "./markdown";
import { ActionButton, Avatar, Caret, ErrorRow, FileChip, Photo, Spinner } from "./parts";
import { assistantParts, groupsSteps, type Assistant, type Row } from "./rows";
import { clockLabel, elapsedLabel, elapsedSeconds } from "./time";
import { StepGroup, ThinkingRow, ToolRow } from "./ToolRow";

type UserRow = Extract<Row, { kind: "user" }>;
type AssistantRow = Extract<Row, { kind: "assistant" }>;
type WorkingRow = Extract<Row, { kind: "working" }>;

const hoverTime =
  "opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 motion-reduce:transition-none";

/** What a reply's parts do when pressed; the Pane owns the expansion. */
export type RowHandlers = {
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
  onRetry: (message: Assistant) => void;
  onRegenerate: (message: Assistant) => void;
  onRate: (message: Assistant, rating: "up" | "down" | undefined) => void;
  copied: () => string | null;
  onCopy: (id: string, text: string) => void;
};

/** What one row of the transcript draws. */
export function MessageRow(props: {
  row: () => Row;
  botName: () => string;
  now: () => number;
  handlers: RowHandlers;
}) {
  const kind = () => props.row().kind;
  return (
    <If
      when={kind() === "user"}
      else={
        <If
          when={kind() === "assistant"}
          else={<Working message={props.row as () => WorkingRow} now={props.now} />}
        >
          <Reply
            row={props.row as () => AssistantRow}
            botName={props.botName}
            handlers={props.handlers}
          />
        </If>
      }
    >
      <Person message={props.row as () => UserRow} />
    </If>
  );
}

/** A message the person sent: its files, then the words, right-aligned. */
function Person(props: { message: () => UserRow }) {
  const m = () => props.message().message;
  const viewing = signal(false);
  return (
    <View
      class="group"
      style={{
        alignItems: "flex-end",
        paddingVertical: 6,
        gap: 6,
      }}
    >
      <If when={!!m().image}>
        <Press onPress={() => viewing.set(true)} accessibilityLabel="Open the attached image">
          <Photo src={m().image!} width={200} height={150} />
        </Press>
      </If>
      <If when={!!m().file}>
        <FileChip file={m().file!} />
      </If>
      <If when={!!m().text}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, maxWidth: "88%" }}>
          <View class={hoverTime} style={{ paddingBottom: 4 }}>
            <Text style={{ fontSize: 11, color: colors.faint, fontVariant: ["tabular-nums"] }}>
              {timeText(m().at)}
            </Text>
          </View>
          <View
            style={{
              flexShrink: 1,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 16,
              borderBottomRightRadius: 5,
              borderCurve: "continuous",
              backgroundColor: colors.raised,
              ...finish.raised,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ userSelect: "text", fontSize: 15, lineHeight: 21, color: colors.text }}>
              {m().text}
            </Text>
          </View>
        </View>
      </If>
      <If when={viewing()}>
        <ImageViewer
          image={{ src: m().image ?? "", alt: m().file?.name ?? "Image" }}
          onClose={() => viewing.set(false)}
        />
      </If>
    </View>
  );
}

/** The bot's reply: who wrote it, then what it thought, ran and said. */
function Reply(props: { row: () => AssistantRow; botName: () => string; handlers: RowHandlers }) {
  const row = () => props.row();
  const message = () => row().message;
  const streaming = () => row().streaming;
  const parts = () => assistantParts(message(), streaming());
  const thinking = () => {
    const part = parts().find((item) => item.kind === "thinking");
    return part && part.kind === "thinking" ? part : null;
  };
  const steps = () => {
    const part = parts().find((item) => item.kind === "steps");
    return part && part.kind === "steps" ? part.tools : null;
  };
  const written = () => message().md;
  const reasoningKey = () => `${message().id}:thinking`;
  const stepsKey = () => `${message().id}:steps`;
  const liveThinking = () =>
    streaming() && thinking() !== null && !written() ? "thinking" : false;
  return (
    <View style={{ paddingVertical: 8, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 24 }}>
        <Avatar />
        <Text style={{ numberOfLines: 1, fontSize: 13, fontWeight: "600", color: colors.muted }}>
          {props.botName()}
        </Text>
        <If when={message().status === "stopped" && !streaming()}>
          <Badge label="Stopped" tone="warn" />
        </If>
        <View style={{ flex: 1 }} />
        <Text
          class={hoverTime}
          style={{ fontSize: 11, color: colors.faint, fontVariant: ["tabular-nums"] }}
        >
          {timeText(message().at)}
        </Text>
      </View>
      <If when={thinking()}>
        <ThinkingRow
          text={() => thinking()?.text ?? ""}
          seconds={() => thinking()?.seconds ?? 0}
          live={liveThinking()}
          open={() => props.handlers.isOpen(reasoningKey())}
          onToggle={() => props.handlers.onToggle(reasoningKey())}
        />
      </If>
      <If when={steps()}>
        <If
          when={groupsSteps(steps() ?? [])}
          else={
            <ToolRow
              tool={() => steps()![0]}
              open={() => props.handlers.isOpen(`${message().id}:tool:${steps()![0].id}`)}
              onToggle={() => props.handlers.onToggle(`${message().id}:tool:${steps()![0].id}`)}
            />
          }
        >
          <StepGroup
            tools={() => steps() ?? []}
            open={() => props.handlers.isOpen(stepsKey())}
            onToggle={() => props.handlers.onToggle(stepsKey())}
            isOpen={props.handlers.isOpen}
            onToggleTool={props.handlers.onToggle}
          />
        </If>
      </If>
      <If when={!!written()}>
        <Markdown
          md={written()}
          id={message().id}
          streaming={streaming()}
          caret={streaming() ? <Caret /> : undefined}
        />
      </If>
      <If when={!streaming() && message().status === "error"}>
        <ErrorRow
          message={message().error ?? "Something went wrong."}
          onRetry={() => props.handlers.onRetry(message())}
        />
      </If>
      <If when={!streaming() && message().status === "stopped"}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Glyph name="stop" size={11} tint={colors.faint} />
          <Text style={{ fontSize: 12, color: colors.faint }}>
            Stopped — the reply keeps what it wrote
          </Text>
        </View>
      </If>
      <If when={!streaming() && message().status !== "error"}>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -8 }}>
          <ActionButton
            glyph={props.handlers.copied() === message().id ? "check" : "copy"}
            label="Copy"
            active={props.handlers.copied() === message().id}
            onPress={() => props.handlers.onCopy(message().id, message().md)}
          />
          <ActionButton
            glyph="regenerate"
            label="Regenerate"
            onPress={() => props.handlers.onRegenerate(message())}
          />
          <ActionButton
            glyph="thumb-up"
            label="Good reply"
            active={message().rating === "up"}
            onPress={() =>
              props.handlers.onRate(message(), message().rating === "up" ? undefined : "up")
            }
          />
          <ActionButton
            glyph="thumb-down"
            label="Bad reply"
            active={message().rating === "down"}
            tone="danger"
            onPress={() =>
              props.handlers.onRate(message(), message().rating === "down" ? undefined : "down")
            }
          />
        </View>
      </If>
    </View>
  );
}

/** The end of the list while the bot runs: who works, and for how long. */
/** A message's time of day, or nothing when dsh gave none. */
function timeText(at: number | undefined): string {
  return at === undefined ? "" : clockLabel(at);
}

function Working(props: { message: () => WorkingRow; now: () => number }) {
  return (
    <View style={{ paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Spinner size={13} tint={colors.accent} />
      <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>Working…</Text>
      <Text style={{ fontSize: 12, color: colors.faint, fontVariant: ["tabular-nums"] }}>
        {elapsedLabel(elapsedSeconds(props.message().since, props.now()))}
      </Text>
    </View>
  );
}
