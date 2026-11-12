/**
 * The composer: the draft that grows from one line to eight, the files it
 * carries (picked, pasted, dropped), the prompt queued behind a running turn,
 * the send key's preference, Stop, and the model chip. Its text and files
 * belong to the SessionController, so switching Panels keeps the draft.
 */
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
} from "nsh";
import { Input, Menu, MenuItem } from "nsh/base";

import { alpha, colors, finish, Press, radius, RoundButton } from "../../../components/ui";
import type { Attachment, SessionController } from "../session/controller";
import { attachDropped } from "./attach";
import { composerFocusRequest, takeComposerFocus } from "./focus";
import { Glyph } from "./glyphs";
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

      <View
        style={{
          borderRadius: 22,
          borderCurve: "continuous",
          ...finish.menu,
          backdropFilter: undefined,
          borderWidth: 1,
          borderColor: focused() ? colors.fieldBorder : colors.border,
          padding: 6,
          gap: 2,
        }}
      >
        <Input
          ref={(node) => (input = node ?? undefined)}
          testID="composer"
          value={draft()}
          onChange={(event) => controller().setDraft(event.value)}
          multiline
          // Desktops send on Return (Shift+Return adds a line), or on the
          // command key when the preference says so; phones keep Return.
          submitBehavior={platform.idiom === "desktop" && sendOnReturn() ? "submit" : "newline"}
          onSubmit={() => send()}
          onPaste={(event) => {
            if (event.text && !event.files.length && !event.uris.length) return;
            if (event.files.length) attach(event.files);
            if (event.uris.length) void attachUrls(event.uris);
          }}
          placeholder={`Message ${props.botName()}…`}
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
            placeholderColor: colors.faint,
            caretColor: colors.accent,
            selectionColor: colors.accent,
            height: textHeight() + 20,
            fontSize: 15,
            lineHeight: LINE_HEIGHT,
            color: colors.text,
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <MiniGlyphButton glyph="clip" label="Attach files" onPress={() => void chooseFiles()} />
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
                <RoundButton icon="arrow-up" label="Send" onPress={send} />
              </View>
            }
          >
            <Press onPress={() => props.onStop()} scale={0.9} accessibilityLabel="Stop generating">
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.light,
                  ...finish.light,
                }}
              >
                <Glyph name="stop" size={14} tint={colors.onLight} />
              </View>
            </Press>
          </If>
        </View>
      </View>

      <If when={trouble()}>
        <Text style={{ fontSize: 12, color: colors.danger }}>{trouble()}</Text>
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
        backgroundColor: colors.inset,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Glyph name="caret-down" size={11} tint={colors.faint} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>QUEUED</Text>
      <Text style={{ numberOfLines: 1, flex: 1, fontSize: 13, color: colors.text }}>
        {props.text}
      </Text>
      <Press
        onPress={props.onWithdraw}
        accessibilityLabel="Withdraw the queued message"
        scale={0.94}
      >
        <View style={{ paddingHorizontal: 8, height: 24, justifyContent: "center" }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>Withdraw</Text>
        </View>
      </Press>
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
        backgroundColor: colors.raised,
        ...finish.raised,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <If when={!!props.attachment.url}>
        <PhotoThumb url={props.attachment.url!} />
      </If>
      <Text style={{ numberOfLines: 1, fontSize: 12, color: colors.text, maxWidth: 160 }}>
        {props.attachment.name}
      </Text>
      <Text style={{ fontSize: 11, color: colors.faint }}>{props.attachment.size}</Text>
      <Press
        onPress={props.onRemove}
        accessibilityLabel={`Remove ${props.attachment.name}`}
        scale={0.85}
      >
        <View style={{ width: 26, height: 28, alignItems: "center", justifyContent: "center" }}>
          <Glyph name="close" size={12} tint={colors.muted} />
        </View>
      </Press>
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
        backgroundColor: colors.inset,
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
    <Menu
      placement="top"
      align="start"
      popupClass="rounded-lg border border-border bg-popover p-1 shadow-lg"
      trigger={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 26,
            paddingHorizontal: 8,
            borderRadius: 13,
            backgroundColor: colors.inset,
          }}
        >
          <Text style={{ numberOfLines: 1, fontSize: 12, color: colors.muted }}>
            {model().label}
          </Text>
          <Glyph name="caret-down" size={10} tint={colors.faint} />
        </View>
      }
    >
      <Each of={model().options} key={(option) => option.value}>
        {(option) => (
          <MenuItem
            checked={option().value === model().current}
            role="menuitemradio"
            onSelect={() => props.onPick(option().value)}
          >
            <Text style={{ fontSize: 13, color: colors.text }}>{option().label}</Text>
          </MenuItem>
        )}
      </Each>
    </Menu>
  );
}

/** The send key, and where to change it. */
function SendKeyMenu() {
  const options: { value: SendKey; label: string }[] = [
    { value: "enter", label: "Return sends" },
    { value: "mod-enter", label: `${sendKeyLabel("mod-enter")} sends` },
  ];
  return (
    <Menu
      placement="top"
      align="end"
      popupClass="rounded-lg border border-border bg-popover p-1 shadow-lg"
      trigger={
        <View style={{ paddingHorizontal: 8, height: 28, justifyContent: "center" }}>
          <Text style={{ fontSize: 11, color: colors.faint }}>
            {sendKeyLabel(sendKey())} to send
          </Text>
        </View>
      }
    >
      <Each of={options} key={(option) => option.value}>
        {(option) => (
          <MenuItem
            checked={sendKey() === option().value}
            role="menuitemradio"
            onSelect={() => setSendKey(option().value)}
          >
            <Text style={{ fontSize: 13, color: colors.text }}>{option().label}</Text>
          </MenuItem>
        )}
      </Each>
    </Menu>
  );
}

function MiniGlyphButton(props: { glyph: "clip"; label: string; onPress: () => void }) {
  return (
    <Press
      onPress={props.onPress}
      accessibilityLabel={props.label}
      scale={0.9}
      style={{ borderRadius: 14, outlineStyle: "none" }}
      hoverStyle={{ backgroundColor: alpha(colors.text, 0.06) }}
    >
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={props.glyph} size={16} tint={colors.muted} />
      </View>
    </Press>
  );
}

function readFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/denied|ACCESS/i.test(message)) return "This app may not read that file.";
  return message || "That file could not be read.";
}
