/**
 * One transcript row: the person's message (a bubble with its attachments),
 * the bot's reply (reasoning, tool steps, Markdown, actions), or the working
 * row while a turn runs. The row is the library's `Message` — its header, its
 * content on the message's side and its footer — and the turn itself a
 * `Bubble`: `muted` for what the person sends, `ghost` for the bot's reply,
 * which keeps the frameless text it had. A row is recycled by the list, so it
 * reads its message through `row()` and keeps no state of its own; the
 * expansion the person chose lives in the Pane.
 */
import { Check, Copy, RotateCw, Square, ThumbsDown, ThumbsUp } from "lucide";
import { signal, Text, View, token } from "nsh";

import { ImageViewer } from "../../../components/app";
import { Badge } from "../../../components/ui/badge";
import { Bubble, BubbleContent, bubbleLook } from "../../../components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "../../../components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "../../../components/ui/message";
import { Pressable } from "../../../components/ui/pressable";
import { Spinner } from "../../../components/ui/spinner";
import { t } from "../../../lib/i18n";
import type { Bot } from "../../bots/model";
import { Markdown } from "./markdown";
import { ActionButton, Avatar, Caret, ErrorRow, FileChip, Photo } from "./parts";
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
  bot: () => Bot | null;
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
            bot={props.bot}
            handlers={props.handlers}
          />
        </If>
      }
    >
      <Person message={props.row as () => UserRow} />
    </If>
  );
}

/** A message the person sent: its files, then the words, on their side. */
function Person(props: { message: () => UserRow }) {
  const m = () => props.message().message;
  const viewing = signal(false);
  return (
    <Message class="group" align="end">
      <MessageContent>
        <If when={!!m().image}>
          <Pressable onPress={() => viewing.set(true)} accessibilityLabel={t("chat.openImage")}>
            <Photo src={m().image!} width={200} height={150} />
          </Pressable>
        </If>
        <If when={!!m().file}>
          <FileChip file={m().file!} />
        </If>
        <If when={!!m().text}>
          <Bubble variant="muted" align="end">
            <BubbleContent>
              <Text style={{ ...bubbleLook().text("muted"), userSelect: "text" }}>{m().text}</Text>
            </BubbleContent>
          </Bubble>
        </If>
        <If when={!!m().text}>
          <MessageFooter>
            <Text
              class={hoverTime}
              style={{ fontSize: 11, color: token("faint"), fontVariant: ["tabular-nums"] }}
            >
              {timeText(m().at)}
            </Text>
          </MessageFooter>
        </If>
        <If when={viewing()}>
          <ImageViewer
            image={{ src: m().image ?? "", alt: m().file?.name ?? "Image" }}
            onClose={() => viewing.set(false)}
          />
        </If>
      </MessageContent>
    </Message>
  );
}

/** The bot's reply: who wrote it, then what it thought, ran and said. */
function Reply(props: {
  row: () => AssistantRow;
  botName: () => string;
  bot: () => Bot | null;
  handlers: RowHandlers;
}) {
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
    <Message class="group" align="start">
      <MessageContent style={{ gap: 6 }}>
        <MessageHeader style={{ paddingHorizontal: 0 }}>
          <Avatar identity={props.bot()?.identity ?? null} working={streaming()} />
          <Text
            style={{
              numberOfLines: 1,
              fontSize: 13,
              fontWeight: "600",
              color: token("muted-foreground"),
            }}
          >
            {props.botName()}
          </Text>
          <If when={message().status === "stopped" && !streaming()}>
            <Badge tone="warn">{t("chat.stopped")}</Badge>
          </If>
          <View style={{ flex: 1 }} />
          <Text
            class={hoverTime}
            style={{ fontSize: 11, color: token("faint"), fontVariant: ["tabular-nums"] }}
          >
            {timeText(message().at)}
          </Text>
        </MessageHeader>
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
        <Bubble variant="ghost" align="start">
          <BubbleContent style={{ gap: 6 }}>
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
                message={message().error ?? t("chat.somethingWrong")}
                onRetry={() => props.handlers.onRetry(message())}
              />
            </If>
            <If when={!streaming() && message().status === "stopped"}>
              <Marker>
                <MarkerIcon icon={Square} />
                <MarkerContent>{t("chat.stoppedNote")}</MarkerContent>
              </Marker>
            </If>
          </BubbleContent>
        </Bubble>
        <If when={!streaming() && message().status !== "error"}>
          <MessageFooter style={{ paddingHorizontal: 4 }}>
            <ActionButton
              glyph={props.handlers.copied() === message().id ? Check : Copy}
              label={t("common.copy")}
              active={props.handlers.copied() === message().id}
              onPress={() => props.handlers.onCopy(message().id, message().md)}
            />
            <ActionButton
              glyph={RotateCw}
              label={t("chat.regenerate")}
              onPress={() => props.handlers.onRegenerate(message())}
            />
            <ActionButton
              glyph={ThumbsUp}
              label={t("chat.goodReply")}
              active={message().rating === "up"}
              onPress={() =>
                props.handlers.onRate(message(), message().rating === "up" ? undefined : "up")
              }
            />
            <ActionButton
              glyph={ThumbsDown}
              label={t("chat.badReply")}
              active={message().rating === "down"}
              tone="danger"
              onPress={() =>
                props.handlers.onRate(message(), message().rating === "down" ? undefined : "down")
              }
            />
          </MessageFooter>
        </If>
      </MessageContent>
    </Message>
  );
}

/** The end of the list while the bot runs: who works, and for how long. */
/** A message's time of day, or nothing when dsh gave none. */
function timeText(at: number | undefined): string {
  return at === undefined ? "" : clockLabel(at);
}

function Working(props: { message: () => WorkingRow; now: () => number }) {
  return (
    <Marker>
      <MarkerIcon>
        <Spinner size={13} tint={token("brand")} />
      </MarkerIcon>
      <MarkerContent style={{ flex: 1 }}>{t("chat.working")}</MarkerContent>
      <Text style={{ fontSize: 12, color: token("faint"), fontVariant: ["tabular-nums"] }}>
        {elapsedLabel(elapsedSeconds(props.message().since, props.now()))}
      </Text>
    </Marker>
  );
}
