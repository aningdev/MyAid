/**
 * The composer: the draft that grows from one line to eight, the files it
 * carries (picked, pasted, dropped), the prompt queued behind a running turn,
 * the send key's preference, Stop, and the model chip. Its text and files
 * belong to the SessionController, so switching Panels keeps the draft.
 */
import { ArrowUp, ChevronDown, type IconNode, Paperclip, Square, X } from "lucide";
import {
  cleanup,
  effect,
  Image,
  type InputRef,
  keyboardFrame,
  keymap,
  Picker,
  platform,
  safeAreaInsets,
  signal,
  Text,
  View,
  type ViewStyle,
  token,
} from "nsh";

import { GroupTextarea } from "../../../components/app";
import { RoundButton, roundButtonGlyph } from "../../../components/ui/button";
import { InputGroup, InputGroupAddon } from "../../../components/ui/input-group";
import { Menu, MenuContent, MenuRadioItem, MenuTrigger } from "../../../components/ui/menu";
import { Pressable } from "../../../components/ui/pressable";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { alpha, radius } from "../../../lib/theme";
import type { Attachment, SessionController } from "../session/controller";
import { attachDropped } from "./attach";
import { composerFocusRequest, takeComposerFocus } from "./focus";
import { ensurePreferences, sendKey, sendKeyLabel, setSendKey, type SendKey } from "./prefs";

/** The model chip's data: what the Session runs on, and what it could run on. */
export type ComposerModel = {
  label: string;
  current: string | null;
  options: { value: string; label: string }[];
};

const LINE_HEIGHT = 20;
const MIN_LINES = 1;
const MAX_LINES = 8;

/** The composer, at the bottom of the transcript's column. */
export function Composer(props: {
  controller: () => SessionController;
  botName: () => string;
  running: () => boolean;
  canSend: () => boolean;
  model: () => ComposerModel;
  /** The last prompt, for ↑ in an empty composer. */
  recall: () => string;
  onSend: () => void;
  onStop: () => void;
  onPickModel: (value: string) => void;
}) {
  ensurePreferences();
  const wide = platform.idiom === "desktop";
  const column: ViewStyle = wide ? { width: "100%", maxWidth: 820, alignSelf: "center" } : {};
  const insets = safeAreaInsets();
  const draft = () => props.controller().draft();
  const attachments = () => props.controller().draftAttachments();
  const queued = () => props.controller().queued();
  const controller = () => props.controller();

  const textHeight = signal(LINE_HEIGHT);
  const focused = signal(false);
  const trouble = signal<string | null>(null);
  let input: InputRef | undefined;

  const attach = (files: readonly (Blob & { name?: string })[]) => {
    if (files.length === 0) return;
    trouble.set(null);
    controller().attachFiles(files);
  };

  /** Files a paste or a drop named as `file:` URLs (`attach` reads them). */
  const attachUrls = async (urls: readonly string[], types: readonly string[] = []) => {
    const { files, notice } = await attachDropped(urls, types);
    attach(files);
    // A file that did not come through says why, after the chips that did.
    trouble.set(notice);
  };

  const chooseFiles = async () => {
    try {
      const picked = await Picker.pickFiles({ multiple: true, limit: 8 });
      attach(picked.map((item) => item.file));
    } catch (error) {
      trouble.set(readFailure(error));
    }
  };

  const send = () => {
    if (!props.canSend()) return;
    trouble.set(null);
    props.onSend();
  };

  const sendOnReturn = () => sendKey() === "enter";

  // ⌘L / ⌘. belong to the command table (Focus Composer, Stop); Escape stops
  // while the composer has the focus, and ↑ in an empty composer brings the
  // last prompt back.
  effect(() => {
    const off = [
      keymap.bind("escape", () => focused() && props.onStop(), {
        when: "always",
        passThrough: true,
      }),
      keymap.bind(
        "mod+enter",
        () => {
          if (!sendOnReturn()) send();
        },
        { when: "always" },
      ),
      keymap.bind(
        "up",
        () => {
          if (!focused() || draft().length > 0) return;
          const text = props.recall();
          if (!text) return;
          input?.insertText(text);
        },
        { when: "always", passThrough: true },
      ),
    ];
    cleanup(() => {
      for (const remove of off) remove();
    });
  });

  // Focus Composer (⌘L, the Chat menu, a new Session): take the request once
  // this composer is the one showing, then give the input the keyboard.
  effect(() => {
    if (!composerFocusRequest()) return;
    if (!takeComposerFocus(controller().sessionId)) return;
    input?.focus();
  });

  return (
    <View
      style={{
        ...column,
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 8 + (keyboardFrame().height > 0 ? 0 : insets().bottom),
        gap: 6,
      }}
    >
      <If when={queued().length > 0}>
        <View style={{ gap: 4 }}>
          <Each of={queued()} key={(item) => item.requestId}>
            {(item) => (
              <QueuedRow
                text={item().text}
                onWithdraw={() => void controller().withdrawQueued(item().requestId)}
              />
            )}
          </Each>
        </View>
      </If>

      <If when={attachments().length > 0}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Each of={attachments()} key={(item) => item.id}>
            {(item) => (
              <AttachmentChip
                attachment={item()}
                onRemove={() => controller().detachFile(item().id)}
              />
            )}
          </Each>
        </View>
      </If>

      <InputGroup style={{ borderRadius: 22, padding: 6, gap: 2 }}>
        <GroupTextarea
          ref={(node) => (input = node ?? undefined)}
          testID="composer"
          value={draft()}
          onChange={(event) => controller().setDraft(event.value)}
          // Desktops send on Return (Shift+Return adds a line), or on the
          // command key when the preference says so; phones keep Return.
          submitBehavior={platform.idiom === "desktop" && sendOnReturn() ? "submit" : "newline"}
          onSubmit={() => send()}
          onPaste={(event) => {
            if (event.text && !event.files.length && !event.uris.length) return;
            if (event.files.length) attach(event.files);
            if (event.uris.length) void attachUrls(event.uris);
          }}
          placeholder={t("chat.composerPlaceholder", { name: props.botName() })}
          onFocus={() => focused.set(true)}
          onBlur={() => focused.set(false)}
          onContentSizeChange={(event) =>
            textHeight.set(
              Math.max(
                LINE_HEIGHT * MIN_LINES,
                Math.min(LINE_HEIGHT * MAX_LINES, event.size.height),
              ),
            )
          }
          style={{
            height: textHeight() + 20,
            fontSize: 15,
            lineHeight: LINE_HEIGHT,
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        />
        <InputGroupAddon align="block-end">
          <MiniGlyphButton
            icon={Paperclip}
            label={t("chat.attach")}
            onPress={() => void chooseFiles()}
          />
          <ModelChip model={props.model} onPick={props.onPickModel} />
          <View style={{ flex: 1 }} />
          <SendKeyMenu />
          <If
            when={props.running()}
            else={
              <View
                style={{
                  pointerEvents: props.canSend() ? "auto" : "none",
                  opacity: props.canSend() ? 1 : 0.35,
                }}
              >
                <RoundButton accessibilityLabel={t("chat.send")} onPress={send}>
                  <Icon icon={ArrowUp} {...roundButtonGlyph("default")} />
                </RoundButton>
              </View>
            }
          >
            <RoundButton
              side={36}
              onPress={() => props.onStop()}
              accessibilityLabel={t("chat.stopGenerating")}
            >
              <Icon icon={Square} {...roundButtonGlyph("default", { side: 36 })} />
            </RoundButton>
          </If>
        </InputGroupAddon>
      </InputGroup>

      <If when={trouble()}>
        <Text style={{ fontSize: 12, color: token("destructive") }}>{trouble()}</Text>
      </If>
    </View>
  );
}

/** A prompt waiting behind the running turn, with the way to take it back. */
function QueuedRow(props: { text: string; onWithdraw: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.control,
        borderCurve: "continuous",
        backgroundColor: token("inset"),
        borderWidth: 1,
        borderColor: token("border"),
      }}
    >
      <Icon icon={ChevronDown} size={11} tint={token("faint")} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: token("muted-foreground") }}>
        {t("chat.queued")}
      </Text>
      <Text style={{ numberOfLines: 1, flex: 1, fontSize: 13, color: token("foreground") }}>
        {props.text}
      </Text>
      <Pressable onPress={props.onWithdraw} accessibilityLabel={t("chat.withdraw")} hitSlop={8}>
        <View style={{ paddingHorizontal: 8, height: 24, justifyContent: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: token("brand") }}>
            {t("chat.withdrawAction")}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** One file on the composer: its preview, its name and a way off. */
function AttachmentChip(props: { attachment: Attachment; onRemove: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 32,
        paddingStart: props.attachment.url ? 3 : 8,
        paddingEnd: 2,
        borderRadius: 8,
        borderCurve: "continuous",
        backgroundColor: token("raised"),
        borderWidth: 1,
        borderColor: token("border"),
      }}
    >
      <If when={!!props.attachment.url}>
        <PhotoThumb url={props.attachment.url!} />
      </If>
      <Text style={{ numberOfLines: 1, fontSize: 12, color: token("foreground"), maxWidth: 160 }}>
        {props.attachment.name}
      </Text>
      <Text style={{ fontSize: 11, color: token("faint") }}>{props.attachment.size}</Text>
      <Pressable
        onPress={props.onRemove}
        accessibilityLabel={t("chat.removeAttachment", { name: props.attachment.name })}
        hitSlop={8}
      >
        <View style={{ width: 26, height: 28, alignItems: "center", justifyContent: "center" }}>
          <Icon icon={X} size={12} tint={token("muted-foreground")} />
        </View>
      </Pressable>
    </View>
  );
}

function PhotoThumb(props: { url: string }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 5,
        overflow: "hidden",
        backgroundColor: token("inset"),
      }}
    >
      <Image src={props.url} style={{ width: 24, height: 24 }} />
    </View>
  );
}

/** The model the Session runs on; a menu picks another from the catalog. */
function ModelChip(props: { model: () => ComposerModel; onPick: (value: string) => void }) {
  const model = () => props.model();
  return (
    <Menu>
      <MenuTrigger>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 26,
            paddingHorizontal: 8,
            borderRadius: 13,
            backgroundColor: token("inset"),
          }}
        >
          <Text style={{ numberOfLines: 1, fontSize: 12, color: token("muted-foreground") }}>
            {model().label}
          </Text>
          <Icon icon={ChevronDown} size={10} tint={token("faint")} />
        </View>
      </MenuTrigger>
      <MenuContent placement="top" align="start">
        <Each of={model().options} key={(option) => option.value}>
          {(option) => (
            <MenuRadioItem
              checked={option().value === model().current}
              onSelect={() => props.onPick(option().value)}
            >
              {option().label}
            </MenuRadioItem>
          )}
        </Each>
      </MenuContent>
    </Menu>
  );
}

/** The send key, and where to change it. */
function SendKeyMenu() {
  const options: { value: SendKey; label: string }[] = [
    { value: "enter", label: t("chat.sendKey.enter") },
    { value: "mod-enter", label: t("chat.sendKey.modEnter", { label: sendKeyLabel("mod-enter") }) },
  ];
  return (
    <Menu>
      <MenuTrigger>
        <View style={{ paddingHorizontal: 8, height: 28, justifyContent: "center" }}>
          <Text style={{ fontSize: 11, color: token("faint") }}>
            {t("chat.sendKeyToSend", { label: sendKeyLabel(sendKey()) })}
          </Text>
        </View>
      </MenuTrigger>
      <MenuContent placement="top" align="end">
        <Each of={options} key={(option) => option.value}>
          {(option) => (
            <MenuRadioItem
              checked={sendKey() === option().value}
              onSelect={() => setSendKey(option().value)}
            >
              {option().label}
            </MenuRadioItem>
          )}
        </Each>
      </MenuContent>
    </Menu>
  );
}

function MiniGlyphButton(props: { icon: IconNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      hitSlop={8}
      style={{ borderRadius: 14 }}
      hoverStyle={{ backgroundColor: alpha(token("foreground"), 0.06) }}
    >
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <Icon icon={props.icon} size={16} tint={token("muted-foreground")} />
      </View>
    </Pressable>
  );
}

function readFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/denied|ACCESS/i.test(message)) return t("chat.fileDenied");
  return message || t("chat.fileUnreadable");
}
