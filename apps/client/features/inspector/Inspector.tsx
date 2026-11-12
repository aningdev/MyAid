/**
 * The Inspector beside a Session's chat: what the Panel's Session belongs to
 * (Bot, Dialogue), what it delivered, and how much context it has spent. It
 * reads only what dsh already reports — the Session view for deliverables, the
 * `contextPressure` / `tokenUsage` projections for usage, `/compact` for
 * compaction — and hides a row whose capability the deployment does not
 * compose instead of drawing a zero.
 *
 * The Inspector is a Panel's, not a Session's: two Panels on one Session can
 * each keep it open at their own width (state.ts). Every value below is read
 * inside the JSX that shows it, so a signal still moves what is on screen.
 */
import { Clipboard, effect, signal, Scroll, Text, untracked, View, type JSX } from "nsh";
import { ResizablePanel, ResizablePanelGroup } from "nsh/base";

import { sessionAddress, workspaceSegment } from "../../components/shell/navAddresses";
import { panelContents, setPanelAddress } from "../../components/shell/state";
import {
  Badge,
  Button,
  colors,
  handleThumb,
  hovered,
  Icon,
  Meter,
  mono,
  Press,
  radius,
  type Tone,
} from "../../components/ui";
import {
  claimOwner,
  presetBinding,
  type Bot,
  type BotTemplate,
  type Dialogue,
  type PresetBindingLabel,
} from "../bots/model";
import { sessionLabel } from "../bots/sessions";
import { openBotSettings } from "../bots/settings";
import { ready, registry } from "../bots/state";
import {
  controllerFor,
  createSession,
  sessionList,
  sessionReady,
} from "../dialogue/session/runtime";
import { modelCatalog } from "../dialogue/session/runtime";
import type { Deliverable } from "../dialogue/session/turn";
import {
  canReveal,
  compactOf,
  compactSession,
  inspectorSource,
  probeReveal,
  refreshUsage,
  revealPath,
  usageOf,
  type CompactRead,
  type UsageRead,
} from "./facts";
import {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  inspectorWidth,
  setInspectorWidth,
} from "./state";

export function Inspector(props: { panelId: string; sessionId: string }) {
  const owner = () => claimOwner(registry(), props.sessionId);
  const bot = () => owner()?.bot ?? null;
  const dialogue = () => owner()?.dialogue ?? null;
  const template = (): BotTemplate | null => {
    const id = bot()?.templateId;
    return registry().templates.find((item) => item.id === id) ?? null;
  };
  const binding = (): { presetId: string; label: PresetBindingLabel } | null => {
    const current = bot();
    if (!current) return null;
    try {
      return presetBinding(current, template());
    } catch {
      return null;
    }
  };
  const model = () => {
    const key = bot()?.defaultModel;
    if (!key) return "默认模型";
    const hit = modelCatalog()?.models.find((item) => `${item.provider}/${item.model}` === key);
    return hit ? hit.name || hit.model : key;
  };

  const copied = signal(false);

  // Usage is read when the Inspector opens and again after each turn ends;
  // the File Manager question rides the same moment (the Connection may only
  // exist now).
  effect(() => {
    if (!sessionReady()) return;
    if (controllerFor(props.sessionId).running()) return;
    // The reads write the signals they own: keep them out of this effect's scope.
    untracked(() => {
      void refreshUsage(props.sessionId);
      void probeReveal();
    });
  });

  const copyPath = (path: string) => {
    void Clipboard.writeText(path);
    copied.set(true);
    setTimeout(() => copied.set(false), 1400);
  };

  const reveal = async (path: string) => {
    if (!canReveal()) {
      copyPath(path);
      return;
    }
    try {
      await revealPath(path);
    } catch {
      copyPath(path);
    }
  };

  const openSession = (sessionId: string, label: string) => {
    const current = dialogue();
    setPanelAddress(
      props.panelId,
      sessionAddress({
        sessionId,
        label,
        ...(current ? { botId: current.botId, dialogueId: current.id } : {}),
      }),
    );
  };

  const newSession = async (): Promise<void> => {
    const current = dialogue();
    if (!current || current.archived) return;
    try {
      const id = await createSession(current.id);
      const claim = current.claims.find((item) => item.sessionId === id);
      openSession(id, sessionLabel(claim ?? { title: null }, null));
    } catch {
      // sessionError carries the reason on the Dialogue's own surfaces.
    }
  };

  /** Sessions of the Panel's Dialogue, newest first, the shown one marked. */
  const sessionsOf = (dialogueId: string) =>
    sessionList()
      .filter((row) => claimOwner(registry(), row.id)?.dialogue.id === dialogueId)
      .map((row) => ({ id: row.id, label: row.label, detail: row.detail }));

  return (
    <View
      testID="inspector"
      style={{
        width: inspectorWidth(props.panelId),
        minWidth: INSPECTOR_MIN_WIDTH,
        maxWidth: INSPECTOR_MAX_WIDTH,
        borderLeftWidth: 1,
        borderLeftColor: colors.line,
        backgroundColor: colors.inset,
      }}
    >
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 14, gap: 18 }}>
        <BotSection
          bot={bot}
          template={template}
          preset={binding}
          model={model}
          ready={ready}
          onOpen={() => {
            const current = bot();
            if (current) openBotSettings(current.id);
          }}
        />
        <DialogueSection
          dialogue={dialogue}
          sessions={() => {
            const current = dialogue();
            return current ? sessionsOf(current.id) : [];
          }}
          current={props.sessionId}
          copied={copied}
          onCopy={copyPath}
          onReveal={(path) => void reveal(path)}
          onOpen={openSession}
          onNew={() => void newSession()}
        />
        <DeliverablesSection
          files={() => inspectorSource().deliverables(props.sessionId)}
          onReveal={(path) => void reveal(path)}
        />
        <UsageSection
          usage={() => usageOf(props.sessionId)}
          compaction={() => compactOf(props.sessionId)}
          onCompact={() => void compactSession(props.sessionId)}
        />
      </Scroll>
    </View>
  );
}

/** A section heading. */
function SectionHeader(props: { title: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>{props.title}</Text>
  );
}

function BotSection(props: {
  bot: () => Bot | null;
  template: () => BotTemplate | null;
  preset: () => { presetId: string; label: PresetBindingLabel } | null;
  model: () => string;
  ready: () => boolean;
  onOpen: () => void;
}) {
  const tone = (): Tone => {
    const label = props.preset()?.label;
    return label === "已绑定" ? "accent" : label === "单独配置" ? "info" : "neutral";
  };
  return (
    <View style={{ gap: 8 }} testID="inspector-bot">
      <SectionHeader title="Bot" />
      <If
        when={props.bot()}
        else={<Muted text={props.ready() ? "这条会话没有认领到 Dialogue。" : "正在读取注册表…"} />}
      >
        {(current) => (
          <View style={{ gap: 8 }}>
            <Press
              onPress={props.onOpen}
              accessibilityLabel={`Bot Settings ${current().name}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderRadius: radius.control,
              }}
              hoverStyle={hovered()}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  borderCurve: "continuous",
                  backgroundColor: colors.raised,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.muted }}>
                  {initial(current().name)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                  {current().name}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, numberOfLines: 1 }}>
                  {props.model()}
                </Text>
              </View>
              <Icon name="chevron" size={12} tint={colors.faint} />
            </Press>
            <View style={{ gap: 4 }}>
              <FactRow label="模板" value={() => props.template()?.name ?? "模板不在了"} />
              <FactRow label="Preset" value={() => props.preset()?.presetId ?? "—"} mono />
              <If when={props.preset()}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 }}>
                  <Badge label={props.preset()?.label ?? ""} tone={tone()} />
                </View>
              </If>
            </View>
            <Button label="Bot Settings…" variant="secondary" size="small" onPress={props.onOpen} />
          </View>
        )}
      </If>
    </View>
  );
}

function DialogueSection(props: {
  dialogue: () => Dialogue | null;
  sessions: () => { id: string; label: string; detail: string }[];
  current: string;
  copied: () => boolean;
  onCopy: (path: string) => void;
  onReveal: (path: string) => void;
  onOpen: (sessionId: string, label: string) => void;
  onNew: () => void;
}) {
  return (
    <View style={{ gap: 8 }} testID="inspector-dialogue">
      <SectionHeader title="Dialogue" />
      <If when={props.dialogue()} else={<Muted text="未认领到 Dialogue。" />}>
        {(current) => (
          <View style={{ gap: 10 }}>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="folder" size={12} tint={colors.faint} />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: colors.text,
                    fontFamily: mono,
                    userSelect: "text",
                    numberOfLines: 2,
                  }}
                >
                  {current().workspacePath}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, paddingLeft: 18 }}>
                <TinyAction
                  label={props.copied() ? "已复制" : "复制路径"}
                  onPress={() => props.onCopy(current().workspacePath)}
                />
                <If when={canReveal()}>
                  <TinyAction
                    label="在 Finder 中显示"
                    onPress={() => props.onReveal(current().workspacePath)}
                  />
                </If>
              </View>
            </View>
            <View style={{ gap: 1 }}>
              <Each of={props.sessions()}>
                {(row) => (
                  <Row
                    label={row().label}
                    detail={row().detail}
                    selected={row().id === props.current}
                    onPress={() => props.onOpen(row().id, row().label)}
                  />
                )}
              </Each>
              <If when={props.sessions().length === 0}>
                <Muted text="还没有 Session。" />
              </If>
            </View>
            <Button
              label="New Session"
              variant="secondary"
              size="small"
              disabled={current().archived}
              onPress={props.onNew}
            />
          </View>
        )}
      </If>
    </View>
  );
}

function DeliverablesSection(props: {
  files: () => Deliverable[];
  onReveal: (path: string) => void;
}) {
  return (
    <View style={{ gap: 8 }} testID="inspector-deliverables">
      <SectionHeader title="交付物" />
      <If
        when={props.files().length > 0}
        else={<Muted text="这段会话还没有交付物（dsh 的 present 记在这里）。" />}
      >
        <View style={{ gap: 1 }}>
          <Each of={props.files()}>
            {(file) => (
              <Row
                label={workspaceSegment(file().path)}
                detail={file().description ?? file().path}
                onPress={() => props.onReveal(file().path)}
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

function UsageSection(props: {
  usage: () => UsageRead;
  compaction: () => CompactRead;
  onCompact: () => void;
}) {
  const context = () => {
    const read = props.usage();
    if (read.status !== "ready") return null;
    const { contextWindow, pressureTokens, projectedTokens } = read.usage;
    if (!contextWindow) return null;
    const used = projectedTokens ?? pressureTokens ?? 0;
    return { window: contextWindow, used, ratio: used / contextWindow };
  };
  const tokens = () => {
    const read = props.usage();
    if (read.status !== "ready" || !read.usage.tokens) return null;
    const totals = read.usage.tokens;
    return {
      input: totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens,
      output: totals.outputTokens,
      cacheRead: totals.cacheReadTokens,
    };
  };
  const failure = () => {
    const read = props.usage();
    return read.status === "failed" ? read.error : "";
  };
  const outcome = () => {
    const read = props.compaction();
    return read.status === "failed" ? read.error : read.status === "done" ? read.text : "";
  };
  return (
    <View style={{ gap: 8 }} testID="inspector-usage">
      <SectionHeader title="用量" />
      <If when={props.usage().status === "loading"}>
        <Muted text="正在读取…" />
      </If>
      <If when={props.usage().status === "failed"}>
        <Text style={{ fontSize: 11, lineHeight: 16, color: colors.danger }}>{failure()}</Text>
      </If>
      <If when={props.usage().status === "ready"}>
        <View style={{ gap: 8 }}>
          <If when={context()} else={<Muted text="后台没有报告上下文窗口。" />}>
            {(read) => (
              <View style={{ gap: 5 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>上下文</Text>
                  <Text style={{ fontSize: 12, color: colors.text, fontVariant: ["tabular-nums"] }}>
                    {`${compactCount(read().used)} / ${compactCount(read().window)}`}
                  </Text>
                </View>
                <Meter value={read().ratio} tone={read().ratio > 0.85 ? "warn" : "accent"} />
              </View>
            )}
          </If>
          <If when={tokens()}>
            {(read) => (
              <View style={{ gap: 3 }}>
                <FactRow label="输入" value={() => compactCount(read().input)} />
                <FactRow label="输出" value={() => compactCount(read().output)} />
                <FactRow label="缓存读取" value={() => compactCount(read().cacheRead)} />
              </View>
            )}
          </If>
        </View>
      </If>
      <If when={props.usage().status === "idle"}>
        <Muted text="连接后台后显示用量。" />
      </If>
      <Button
        label={props.compaction().status === "running" ? "正在压缩…" : "Compact"}
        variant="secondary"
        size="small"
        disabled={props.compaction().status === "running"}
        onPress={props.onCompact}
      />
      <If when={props.compaction().status !== "idle" && props.compaction().status !== "running"}>
        <Text
          style={{
            fontSize: 11,
            lineHeight: 16,
            color: props.compaction().status === "failed" ? colors.danger : colors.muted,
          }}
        >
          {outcome()}
        </Text>
      </If>
    </View>
  );
}

/** A label and its value on one line (values stay selectable). */
function FactRow(props: { label: string; value: () => string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
      <Text style={{ width: 62, fontSize: 11, color: colors.muted }}>{props.label}</Text>
      <Text
        style={{
          flex: 1,
          fontSize: 12,
          color: colors.text,
          ...(props.mono ? { fontFamily: mono } : {}),
          userSelect: "text",
          numberOfLines: 2,
        }}
      >
        {props.value()}
      </Text>
    </View>
  );
}

function Row(props: { label: string; detail: string; selected?: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.label}
      accessibilityState={{ selected: !!props.selected }}
      hoverStyle={props.selected ? undefined : hovered()}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: radius.control,
        gap: 1,
        backgroundColor: props.selected ? colors.raised : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: props.selected ? "600" : "400",
          color: colors.text,
          numberOfLines: 1,
        }}
      >
        {props.label}
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted, numberOfLines: 1 }}>{props.detail}</Text>
    </View>
  );
}

function TinyAction(props: { label: string; onPress: () => void }) {
  return (
    <Press onPress={props.onPress} accessibilityLabel={props.label} scale={0.96}>
      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.accent }}>{props.label}</Text>
    </Press>
  );
}

function Muted(props: { text: string }) {
  return <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>{props.text}</Text>;
}

function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : "?";
}

/** The Session a Panel shows, or null. */
export function shownSession(panelId: string): string | null {
  const contents = panelContents()[panelId];
  return contents?.kind === "session" ? (contents.sessionId ?? null) : null;
}

/** 1 200 → "1.2K", 128 000 → "128K", 1 048 576 → "1.0M". */
export function compactCount(value: number): string {
  const scaled = (candidate: number) =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}

/** The chat at `flex-1` beside the resizable Inspector (268–320, per Panel). */
export function SessionWithInspector(props: { panelId: string; children: JSX.Element }) {
  return (
    <ResizablePanelGroup
      axis="horizontal"
      handleClass="bg-border"
      handleThumbClass={handleThumb}
      handleAccessibilityLabel="Resize inspector"
      style={{ flex: 1, minHeight: 0, minWidth: 0 }}
    >
      <ResizablePanel class="min-h-0 min-w-0 flex-1">{props.children}</ResizablePanel>
      <ResizablePanel
        size={inspectorWidth(props.panelId)}
        minSize={INSPECTOR_MIN_WIDTH}
        maxSize={INSPECTOR_MAX_WIDTH}
        onResize={({ size }) => setInspectorWidth(props.panelId, size)}
        class="min-h-0 min-w-0"
      >
        {/* The Panel's address is the truth: a Session → Session move in this
            Panel moves its Inspector too. */}
        <If when={shownSession(props.panelId)}>
          {(sessionId) => <Inspector panelId={props.panelId} sessionId={sessionId()} />}
        </If>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
