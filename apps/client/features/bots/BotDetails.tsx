/**
 * Bot details: one modal over the Pane, the product face of a Bot's single
 * Agent preset — opened from the Pane header (beside split / close), the
 * list's context menu and the palette.
 *
 * - **Profile** — name and description in the desktop registry, the template
 *   it came from, and how its preset is bound (跟随模板 / 已绑定 / 单独配置).
 * - **Runs with** — the model, its thinking level and the default working
 *   directory a new segment suggests. All three are registry preferences.
 * - **Skills** — the skills dsh reports for this Bot's composition
 *   (`skills.list`). Adding one means writing the preset body.
 * - **Plugins** — the plugin rows of the Bot's preset (`pluginInventory`), and
 *   whether this profile can manage them.
 * - **Current segment** — the workspace, model, usage / context of the Session
 *   the Pane shows, and dsh's own Compact.
 * - **Delete / Archive** — archive hides the Bot from the list (search finds
 *   it again); delete is only for a Bot that never had a conversation.
 *
 * Capability edits (a skill added, a plugin switched) go through the
 * `presets.ts` seam, backed by `myaid-plugin-bot-presets` when the Host mounts
 * it. Without that Remote the modal stays honestly read-only. Nothing here
 * fakes a preset: the registry records a derived preset id only when the writer
 * returned one.
 *
 * Escape closes, Return saves, errors show inline.
 */

import type {
  BotPresetPlugin,
  BotPresetRecord,
  BotPresetSkill,
} from "@myaid/dsh-web-protocol/bot-presets";
import {
  Clipboard,
  cleanup,
  effect,
  keymap,
  Scroll,
  signal,
  Text,
  untracked,
  View,
  type Signal,
} from "nsh";
import { Dialog } from "nsh/base";

import {
  Button,
  colors,
  Field,
  hovered,
  Icon,
  Meter,
  mono,
  Press,
  radius,
  Segmented,
} from "../../components/ui";
import type { InventoryPreset, SkillSummary } from "../../lib/dsh/connection";
import { catalogModelKey, modelCatalog, sessionList } from "../dialogue/session/runtime";
import { workspacePath, workspaces } from "../workspace/state";
import { BotIdentityPicker, BotMark } from "./BotMark";
import { botDetailsFor, closeBotDetails } from "./details";
import { botFactsSource } from "./facts";
import { defaultIdentity, type BotIdentity } from "./identity";
import {
  archiveBot,
  assignDerivedPreset,
  deleteBot,
  presetBinding,
  unarchiveBot,
  updateBot,
  type Bot,
  type BotTemplate,
  type PresetBindingLabel,
} from "./model";
import { presetWriter, PRESET_WRITE_GAP } from "./presets";
import {
  canReveal,
  compactCount,
  compactOf,
  compactSession,
  probeReveal,
  refreshUsage,
  revealPath,
  usageOf,
  type CompactRead,
  type UsageRead,
} from "./sessionFacts";
import { currentSegmentOf } from "./sessions";
import { actionError, changeRegistry, ready, registry, saving } from "./state";

type Tab = "profile" | "runs" | "skills" | "plugins";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "runs", label: "Runs with" },
  { value: "skills", label: "Skills" },
  { value: "plugins", label: "Plugins" },
];

/** Stable key for one inventory row: entry id when present, else module name. */
function pluginKey(row: { entryId: string | null; moduleName: string }): string {
  return row.entryId !== null ? `id:${row.entryId}` : `name:${row.moduleName}`;
}

/** The Bot details modal, mounted once by the app shell; the Bot id lives in `details.ts`. */
export function BotDetails() {
  const botId = () => botDetailsFor();
  return (
    <Dialog
      open={botId() !== null}
      animation="fade"
      accessibilityLabel="Bot details"
      onCancel={closeBotDetails}
      onOpenChange={({ open }) => {
        if (!open) closeBotDetails();
      }}
      backdropStyle={{ backgroundColor: "rgba(0,0,0,0.32)" }}
      style={{ margin: "auto", width: 660, maxWidth: "94%", maxHeight: "92%" }}
    >
      <If when={botId()}>{(id) => <Body botId={id()} onClose={closeBotDetails} />}</If>
    </Dialog>
  );
}

function Body(props: { botId: string; onClose: () => void }) {
  const bot = (): Bot | null => registry().bots.find((item) => item.id === props.botId) ?? null;
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

  const tab = signal<Tab>("profile");
  const name = signal(bot()?.name ?? "");
  const identity = signal<BotIdentity>(bot()?.identity ?? defaultIdentity(props.botId));
  const description = signal(bot()?.description ?? "");
  const modelKey = signal(bot()?.defaultModel ?? "");
  const thinking = signal(bot()?.defaultThinking ?? "");
  const workspace = signal(bot()?.defaultWorkspacePath ?? "");
  const savingNow = signal(false);
  const failure = signal<string | null>(null);
  /** Plugin rows the person changed, keyed by {@link pluginKey}. */
  const changed = signal<Readonly<Record<string, boolean>>>({});
  /** Skill bundles added on top of the base composition. */
  const addedSkills = signal<readonly BotPresetSkill[]>([]);
  /** The Bot's saved derived preset, when it has one. */
  const derived = signal<BotPresetRecord | null>(null);
  /** Whether the Host has the `myaidBotPresets` Remote. */
  const writable = signal(false);
  /** A person changed a plugin row / the added skill list. */
  const pluginsDirty = signal(false);
  const skillsDirty = signal(false);

  const skills = signal<SkillSummary[] | null>(null);
  const inventory = signal<InventoryPreset | null>(null);
  const factsNote = signal<string | null>(null);

  const models = () => modelCatalog()?.models ?? [];
  const chosenModel = () =>
    models().find((item) => `${item.provider}/${item.model}` === modelKey());
  const levels = () => chosenModel()?.thinking ?? [];
  const presetId = () => binding()?.presetId ?? "";

  /** The Session this Bot's Pane shows: what the segment section describes. */
  const segment = () =>
    currentSegmentOf({
      registry: registry(),
      workspaces: workspaces(),
      botId: props.botId,
    });

  /** A Session of this Bot, the current one first: `skills.list` and the
   * preset composition are Session-addressable, not Bot-addressable. */
  const sampleSession = (): string | null =>
    segment()?.segment.sessionId ??
    sessionList().find((row) => row.botId === props.botId)?.id ??
    null;

  const load = async (): Promise<void> => {
    try {
      const writer = presetWriter();
      writable.set(await writer.probe());
      const facts = await botFactsSource()({
        botId: props.botId,
        presetId: presetId(),
        sessionId: sampleSession(),
      });
      skills.set(facts.skills);
      inventory.set(facts.preset);
      factsNote.set(facts.note ?? null);
      const current = bot();
      if (current?.derivedPresetId) {
        const record = await writer.read(current.derivedPresetId);
        if (record) {
          derived.set(record);
          changed.set(
            Object.fromEntries(record.plugins.map((item) => [pluginKey(item), item.enabled])),
          );
          addedSkills.set(record.skills);
        }
      }
    } catch (error) {
      factsNote.set(error instanceof Error ? error.message : String(error));
    }
  };

  effect(() => {
    void load();
  });

  // Return saves unless a field has the keyboard; Escape is the dialog's.
  effect(() => {
    const off = keymap.bind("return", () => void save(), { when: "notEditing" });
    cleanup(off);
  });

  const enabledOf = (row: InventoryPreset["rows"][number]): boolean => {
    const value = changed()[pluginKey(row)];
    return value === undefined ? row.enabled === true : value;
  };

  /** The complete override list to save: changed rows, plus saved rows the
   * inventory no longer shows (a partial read must not drop them). */
  const overrides = (): BotPresetPlugin[] => {
    const rows = inventory()?.rows ?? [];
    const result: BotPresetPlugin[] = [];
    const seen = new Set<string>();
    for (const [key, enabled] of Object.entries(changed())) {
      const row = rows.find((item) => pluginKey(item) === key);
      if (!row) continue;
      result.push({ entryId: row.entryId, moduleName: row.moduleName, enabled });
      seen.add(key);
    }
    for (const item of derived()?.plugins ?? []) {
      if (!seen.has(pluginKey(item))) result.push(item);
    }
    return result;
  };

  const save = async (): Promise<void> => {
    const current = bot();
    if (!current || savingNow()) return;
    if (!name().trim()) {
      failure.set("名称不能为空。");
      return;
    }
    const wantsPlugins = pluginsDirty();
    const wantsSkills = skillsDirty();
    if ((wantsPlugins || wantsSkills) && !writable()) {
      failure.set(PRESET_WRITE_GAP);
      return;
    }
    savingNow.set(true);
    failure.set(null);
    try {
      let derivedPresetId = current.derivedPresetId;
      if (wantsPlugins || wantsSkills) {
        const writer = presetWriter();
        let target = derivedPresetId;
        if (!target) {
          const result = await writer.derive({
            botId: current.id,
            label: name().trim(),
            basePresetId: presetId(),
          });
          if ("unavailable" in result) {
            failure.set(result.unavailable);
            return;
          }
          target = result.presetId;
        }
        const patch: { plugins?: BotPresetPlugin[]; skills?: string[] } = {};
        if (wantsPlugins) patch.plugins = overrides();
        if (wantsSkills) patch.skills = addedSkills().map((item) => item.path);
        const result = await writer.update(target, patch);
        if ("unavailable" in result) {
          failure.set(result.unavailable);
          return;
        }
        derived.set(result);
        changed.set(
          Object.fromEntries(result.plugins.map((item) => [pluginKey(item), item.enabled])),
        );
        addedSkills.set(result.skills);
        pluginsDirty.set(false);
        skillsDirty.set(false);
        derivedPresetId = result.presetId;
      }
      const next = await changeRegistry((registry) => {
        const updated = updateBot(registry, current.id, {
          name: name(),
          description: description(),
          defaultModel: modelKey() || null,
          defaultThinking: thinking() || null,
          defaultWorkspacePath: workspace() || null,
          identity: identity(),
        });
        return derivedPresetId && derivedPresetId !== current.derivedPresetId
          ? assignDerivedPreset(updated, current.id, derivedPresetId)
          : updated;
      });
      if (next) {
        props.onClose();
        return;
      }
      failure.set(actionError() ?? "保存失败。");
    } finally {
      savingNow.set(false);
    }
  };

  const remove = async (): Promise<void> => {
    const current = bot();
    if (!current) return;
    const next = await changeRegistry((registry) => deleteBot(registry, current.id));
    if (next) {
      props.onClose();
      return;
    }
    failure.set(actionError() ?? "This Bot cannot be deleted.");
  };

  const setArchived = async (archived: boolean): Promise<void> => {
    const current = bot();
    if (!current) return;
    const next = await changeRegistry((registry) =>
      archived ? archiveBot(registry, current.id) : unarchiveBot(registry, current.id),
    );
    if (next && archived) props.onClose();
  };

  const chooseWorkspace = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (path) workspace.set(path);
    } catch (error) {
      failure.set(error instanceof Error ? error.message : String(error));
    }
  };

  const chooseSkill = async (): Promise<void> => {
    try {
      const { pickDirectory } = await import("../../lib/dsh/session");
      const path = await pickDirectory();
      if (!path || addedSkills().some((item) => item.path === path)) return;
      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
      addedSkills.set([...addedSkills(), { name, path }]);
      skillsDirty.set(true);
    } catch (error) {
      failure.set(error instanceof Error ? error.message : String(error));
    }
  };

  const removeSkill = (path: string): void => {
    addedSkills.set(addedSkills().filter((item) => item.path !== path));
    skillsDirty.set(true);
  };

  const toggleRow = (row: InventoryPreset["rows"][number]) => {
    if (!writable()) return;
    changed.set({ ...changed(), [pluginKey(row)]: !enabledOf(row) });
    pluginsDirty.set(true);
  };

  return (
    <View
      testID="bot-details"
      class="overflow-hidden"
      style={{
        gap: 12,
        padding: 16,
        borderRadius: radius.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        flexDirection: "column",
        maxHeight: "100%",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <If when={bot()}>{(current) => <BotMark identity={current().identity} size={28} />}</If>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
            {bot()?.name ?? "Bot details"}
          </Text>
          <Text style={{ fontSize: 11, color: colors.faint }}>
            {bot()?.archived ? "Archived · Profile, Runs with, Skills, Plugins" : "Bot details"}
          </Text>
        </View>
        <Press
          onPress={props.onClose}
          accessibilityLabel="Close Bot details"
          scale={0.96}
          style={{ padding: 6 }}
        >
          <Icon name="close" size={14} tint={colors.muted} />
        </Press>
      </View>
      <Segmented options={TABS} value={tab()} onChange={tab.set} size="small" />
      <Scroll
        testID="bot-details-scroll"
        style={{ flexShrink: 1, minHeight: 0 }}
        contentStyle={{ gap: 14, paddingVertical: 4 }}
      >
        <If when={tab() === "profile"}>
          <ProfileTab
            name={name}
            description={description}
            identity={identity}
            template={template}
            binding={binding}
            ready={ready}
          />
        </If>
        <If when={tab() === "runs"}>
          <RunsTab
            models={() =>
              models().map((item) => ({
                key: `${item.provider}/${item.model}`,
                label: item.name || item.model,
              }))
            }
            modelKey={modelKey}
            levels={levels}
            thinking={thinking}
            workspace={workspace}
            onChooseWorkspace={() => void chooseWorkspace()}
          />
        </If>
        <If when={tab() === "skills"}>
          <SkillsTab
            skills={skills}
            added={addedSkills}
            writable={() => writable()}
            note={factsNote}
            onAdd={() => void chooseSkill()}
            onRemove={removeSkill}
          />
        </If>
        <If when={tab() === "plugins"}>
          <PluginsTab
            presetId={presetId}
            preset={inventory}
            changed={changed}
            note={factsNote}
            writable={() => writable()}
            onToggle={toggleRow}
          />
        </If>
        <SegmentSection botId={props.botId} onFailure={failure.set} />
      </Scroll>
      <If when={!!failure()}>
        <Text style={{ fontSize: 12, lineHeight: 17, color: colors.danger }}>{failure()}</Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <If when={!!bot()}>
          <Button
            label="Delete"
            variant="ghost"
            size="small"
            disabled={saving() || savingNow() || !!bot()?.hadDialogue}
            onPress={() => void remove()}
          />
          <Button
            label={bot()?.archived ? "Unarchive" : "Archive"}
            variant="ghost"
            size="small"
            disabled={saving() || savingNow()}
            onPress={() => void setArchived(!bot()?.archived)}
          />
        </If>
        <View style={{ flex: 1 }} />
        <Button label="Cancel" variant="secondary" size="small" onPress={props.onClose} />
        <Button
          label="Save"
          variant="accent"
          size="small"
          disabled={saving() || savingNow()}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}

/**
 * The segment the Pane shows: its workspace and model, how much of its context
 * is spent, and dsh's Compact. Reads the Session's own facts; nothing here is
 * stored on the Bot.
 */
function SegmentSection(props: { botId: string; onFailure: (message: string) => void }) {
  const segment = () =>
    currentSegmentOf({
      registry: registry(),
      workspaces: workspaces(),
      botId: props.botId,
    });
  /** The Session **id** keys the block: the projection object is rebuilt per read. */
  const segmentId = () => segment()?.segment.sessionId ?? null;
  const path = () => segment()?.workspacePath ?? "";
  const model = () => {
    const catalog = modelCatalog();
    const key =
      catalogModelKey() ??
      registry().bots.find((bot) => bot.id === props.botId)?.defaultModel ??
      null;
    if (!key) return "—";
    const hit = (catalog?.models ?? []).find((item) => `${item.provider}/${item.model}` === key);
    return hit ? hit.name || hit.model : key;
  };
  const copied = signal(false);

  // Usage is read when the modal opens and after Compact; a running Session
  // answers with what it has.
  effect(() => {
    const current = segment();
    if (!current) return;
    untracked(() => {
      void refreshUsage(current.segment.sessionId);
      void probeReveal();
    });
  });

  const copy = (text: string) => {
    if (!text) return;
    void Clipboard.writeText(text);
    copied.set(true);
    setTimeout(() => copied.set(false), 1400);
  };

  const reveal = async (target: string): Promise<void> => {
    if (!target) return;
    if (!canReveal()) {
      copy(target);
      return;
    }
    try {
      await revealPath(target);
    } catch {
      copy(target);
    }
  };

  const compact = async (sessionId: string): Promise<void> => {
    try {
      await compactSession(sessionId);
    } catch (error) {
      props.onFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <View style={{ gap: 10 }} testID="bot-details-segment">
      <View style={{ height: 1, backgroundColor: colors.line }} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Current segment</Text>
      <If
        when={segmentId()}
        else={
          <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>
            This Bot has no segment yet. Send a first message in its Pane.
          </Text>
        }
      >
        {(sessionId) => (
          <View style={{ gap: 8 }}>
            <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>Working directory</Text>
              {/* dsh may not have reported the Workspace yet: the line stays
                  rather than collapsing, so the section never reads as cut off. */}
              <Text
                testID="bot-details-path"
                style={{
                  fontSize: 12,
                  color: path() ? colors.text : colors.faint,
                  fontFamily: mono,
                  userSelect: "text",
                  numberOfLines: 2,
                }}
              >
                {path() || "—"}
              </Text>
            </View>
            <If when={!!path()}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Tiny label={copied() ? "Copied" : "Copy path"} onPress={() => copy(path())} />
                <If when={canReveal()}>
                  <Tiny label="Reveal in Finder" onPress={() => void reveal(path())} />
                </If>
              </View>
            </If>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ width: 72, fontSize: 11, color: colors.muted }}>Model</Text>
              <Text
                testID="bot-details-model"
                style={{ flex: 1, fontSize: 12, color: colors.text, numberOfLines: 1 }}
              >
                {model()}
              </Text>
            </View>
            <Usage
              read={() => usageOf(sessionId())}
              compactRead={() => compactOf(sessionId())}
              onCompact={() => void compact(sessionId())}
            />
          </View>
        )}
      </If>
    </View>
  );
}

function Usage(props: {
  read: () => UsageRead;
  compactRead: () => CompactRead;
  onCompact: () => void;
}) {
  const context = () => {
    const read = props.read();
    if (read.status !== "ready") return null;
    const { contextWindow, pressureTokens, projectedTokens } = read.usage;
    if (!contextWindow) return null;
    const used = projectedTokens ?? pressureTokens ?? 0;
    return { window: contextWindow, used, ratio: used / contextWindow };
  };
  const failure = () => {
    const read = props.read();
    return read.status === "failed" ? read.error : "";
  };
  const outcome = () => {
    const read = props.compactRead();
    return read.status === "failed" ? read.error : read.status === "done" ? read.text : "";
  };
  return (
    <View style={{ gap: 6 }} testID="bot-details-usage">
      <If when={props.read().status === "ready"}>
        <If
          when={context()}
          else={
            <Text style={{ fontSize: 11, color: colors.muted }}>
              The backend reports no context window.
            </Text>
          }
        >
          {(read) => (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 11, color: colors.muted }}>Context</Text>
                <Text
                  testID="bot-details-context"
                  style={{ fontSize: 11, color: colors.text, fontVariant: ["tabular-nums"] }}
                >
                  {`${Math.round(read().ratio * 100)}% · ${compactCount(read().used)} / ${compactCount(read().window)}`}
                </Text>
              </View>
              <Meter value={read().ratio} tone={read().ratio > 0.85 ? "warn" : "accent"} />
            </View>
          )}
        </If>
      </If>
      <If when={props.read().status === "failed"}>
        <Text style={{ fontSize: 11, lineHeight: 16, color: colors.danger }}>{failure()}</Text>
      </If>
      <If when={props.read().status === "idle" || props.read().status === "loading"}>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          {props.read().status === "loading"
            ? "Reading…"
            : "Usage shows once connected to the backend."}
        </Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button
          label={props.compactRead().status === "running" ? "Compacting…" : "Compact"}
          variant="secondary"
          size="small"
          disabled={props.compactRead().status === "running"}
          onPress={props.onCompact}
        />
        <If
          when={props.compactRead().status !== "idle" && props.compactRead().status !== "running"}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 11,
              lineHeight: 16,
              color: props.compactRead().status === "failed" ? colors.danger : colors.muted,
            }}
          >
            {outcome()}
          </Text>
        </If>
      </View>
    </View>
  );
}

/** A small accent action. */
function Tiny(props: { label: string; onPress: () => void }) {
  return (
    <Press onPress={props.onPress} accessibilityLabel={props.label} scale={0.96}>
      <Text style={{ fontSize: 11, fontWeight: "500", color: colors.accent }}>{props.label}</Text>
    </Press>
  );
}

function ProfileTab(props: {
  name: Signal<string>;
  description: Signal<string>;
  identity: Signal<BotIdentity>;
  template: () => BotTemplate | null;
  binding: () => { presetId: string; label: PresetBindingLabel } | null;
  ready: () => boolean;
}) {
  const label = () => props.binding()?.label ?? "";
  const tone = () =>
    label() === "已绑定" ? colors.accent : label() === "单独配置" ? colors.info : colors.muted;
  return (
    <View style={{ gap: 12 }}>
      <If when={props.ready()} else={<Hint text="Reading the registry…" />}>
        <Field
          label="名称"
          testID="bot-details-name"
          value={props.name()}
          placeholder="Ada"
          onChange={props.name.set}
        />
        <Field
          label="说明"
          testID="bot-details-description"
          value={props.description()}
          placeholder="一句话说清它帮你做什么"
          onChange={props.description.set}
        />
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <BotMark identity={props.identity()} size={22} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Identity</Text>
          </View>
          <BotIdentityPicker
            identity={() => props.identity()}
            onChange={(next) => props.identity.set(next)}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
            模板与 preset
          </Text>
          <Text style={{ fontSize: 14, color: colors.text }}>
            {props.template()?.name ?? "模板不在了"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{ fontSize: 12, color: colors.text, fontFamily: mono, userSelect: "text" }}
            >
              {props.binding()?.presetId ?? "—"}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: tone() }}>{label()}</Text>
          </View>
          <Hint text="保存能力后，这个 Bot 的新段使用派生 preset；已打开的段不变。" />
        </View>
      </If>
    </View>
  );
}

function RunsTab(props: {
  models: () => { key: string; label: string }[];
  modelKey: Signal<string>;
  levels: () => { id: string; name: string }[];
  thinking: Signal<string>;
  workspace: Signal<string>;
  onChooseWorkspace: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>模型</Text>
        <If
          when={props.models().length > 0}
          else={<Hint text="后台没有报告模型目录；连上之后从 dsh 的目录里选。" />}
        >
          <View style={{ gap: 1 }}>
            <Each of={props.models()}>
              {(item) => (
                <Choice
                  label={item().label}
                  detail={item().key}
                  selected={props.modelKey() === item().key}
                  onPress={() => {
                    props.modelKey.set(item().key);
                    props.thinking.set("");
                  }}
                />
              )}
            </Each>
          </View>
        </If>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>思考</Text>
        <If when={props.levels().length > 0} else={<Hint text="这个模型没有报告思考档位。" />}>
          <Segmented
            size="small"
            options={[
              { value: "", label: "默认" },
              ...props.levels().map((item) => ({ value: item.id, label: item.name })),
            ]}
            value={props.thinking()}
            onChange={props.thinking.set}
          />
        </If>
      </View>
      <Field
        label="默认工作目录"
        testID="bot-details-workspace"
        value={props.workspace()}
        placeholder="/path/to/project"
        onChange={props.workspace.set}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="选择目录…" size="small" onPress={props.onChooseWorkspace} />
      </View>
      <Hint text="开新段时作为默认工作目录；已有的段保留自己的路径。" />
    </View>
  );
}

function SkillsTab(props: {
  skills: Signal<SkillSummary[] | null>;
  added: Signal<readonly BotPresetSkill[]>;
  writable: () => boolean;
  note: Signal<string | null>;
  onAdd: () => void;
  onRemove: (path: string) => void;
}) {
  const base = () => props.skills() ?? [];
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title="组合自带的技能" />
      <If when={props.skills() === null} else={null}>
        <Hint text="正在读取…" />
      </If>
      <If when={base().length > 0} else={<Hint text="这个 Bot 的组合里还没有用户可调用的技能。" />}>
        <View style={{ gap: 1 }}>
          <Each of={base()}>
            {(skill) => <Row label={`/${skill().name}`} detail={skill().description || "—"} />}
          </Each>
        </View>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SectionTitle title="已添加" />
        <View style={{ flex: 1 }} />
        <Button
          label="+ 添加技能目录…"
          size="small"
          variant="secondary"
          disabled={!props.writable()}
          onPress={props.onAdd}
        />
      </View>
      <If
        when={props.added().length > 0}
        else={
          <Hint text="还没有添加技能。选一个含 SKILL.md 的目录，复制进这个 Bot 的派生 preset。" />
        }
      >
        <View style={{ gap: 1 }}>
          <Each of={props.added()}>
            {(skill) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.text, fontFamily: mono }}>
                    {`/${skill().name}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.muted, numberOfLines: 1 }}>
                    {skill().path}
                  </Text>
                </View>
                <Press
                  onPress={() => props.onRemove(skill().path)}
                  accessibilityLabel={`移除 ${skill().name}`}
                  accessibilityState={{ disabled: !props.writable() }}
                  disabled={!props.writable()}
                  scale={0.96}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.danger }}>
                    移除
                  </Text>
                </Press>
              </View>
            )}
          </Each>
        </View>
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <If when={!props.writable()}>
        <Hint text={PRESET_WRITE_GAP} />
      </If>
      <If when={props.writable()}>
        <Hint text="已添加的技能复制进这个 Bot 的派生 preset；组合自带的技能不受影响。新段使用派生 preset，已打开的段不变。" />
      </If>
    </View>
  );
}

function PluginsTab(props: {
  presetId: () => string;
  preset: Signal<InventoryPreset | null>;
  changed: Signal<Readonly<Record<string, boolean>>>;
  note: Signal<string | null>;
  writable: () => boolean;
  onToggle: (row: InventoryPreset["rows"][number]) => void;
}) {
  const enabledOf = (row: InventoryPreset["rows"][number]) => {
    const changed = props.changed()[pluginKey(row)];
    return changed === undefined ? row.enabled === true : changed;
  };
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
        {`${props.presetId() || "preset"} 的组合`}
      </Text>
      <If
        when={(props.preset()?.rows ?? []).length > 0}
        else={<Hint text="后台没有报告这个 preset 的组合（可能未挂载或已损坏）。" />}
      >
        <View style={{ gap: 1 }}>
          <Each of={props.preset()?.rows ?? []}>
            {(row) => (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.text, numberOfLines: 1 }}>
                    {row().name ?? row().moduleName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: colors.muted,
                      fontFamily: mono,
                      numberOfLines: 1,
                    }}
                  >
                    {row().moduleName}
                  </Text>
                </View>
                <Press
                  onPress={() => props.onToggle(row())}
                  accessibilityLabel={`切换 ${row().name ?? row().moduleName}`}
                  accessibilityState={{ checked: enabledOf(row()), disabled: !props.writable() }}
                  disabled={!props.writable()}
                  scale={0.96}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: enabledOf(row()) ? colors.accent : colors.muted,
                    }}
                  >
                    {enabledOf(row()) ? "已启用" : "已停用"}
                  </Text>
                </Press>
              </View>
            )}
          </Each>
        </View>
      </If>
      <If when={!!props.preset()?.broken}>
        <Hint text={props.preset()?.broken ?? ""} />
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <If when={!props.writable()}>
        <Hint text={PRESET_WRITE_GAP} />
      </If>
      <If when={props.writable()}>
        <Hint text="切换后保存，这个 Bot 改用派生 preset；新段使用它，已打开的段不变。" />
      </If>
    </View>
  );
}

function Choice(props: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.label}
      accessibilityState={{ selected: props.selected }}
      hoverStyle={hovered()}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: props.selected ? colors.raised : "transparent",
        gap: 1,
      }}
    >
      <Text
        style={{ fontSize: 12, fontWeight: props.selected ? "600" : "400", color: colors.text }}
      >
        {props.label}
      </Text>
      <Text style={{ fontSize: 11, color: colors.muted, fontFamily: mono, numberOfLines: 1 }}>
        {props.detail}
      </Text>
    </View>
  );
}

function Row(props: { label: string; detail: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 1,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Text style={{ fontSize: 12, color: colors.text, fontFamily: mono }}>{props.label}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, numberOfLines: 2 }}>{props.detail}</Text>
    </View>
  );
}

function SectionTitle(props: { title: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{props.title}</Text>
  );
}

function Hint(props: { text: string }) {
  return <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>{props.text}</Text>;
}
