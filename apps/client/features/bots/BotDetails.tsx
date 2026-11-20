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
 * `presets.ts` seam, backed by the `bot-presets` plugin when the Host mounts
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
} from "@dsh-bot/dsh-web-protocol/bot-presets";
import { X } from "lucide";
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
  token,
} from "nsh";

import { OptionSegmented } from "../../components/app";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Meter } from "../../components/ui/meter";
import { Pressable } from "../../components/ui/pressable";
import { Radio, RadioGroup } from "../../components/ui/radio-group";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import type { InventoryPreset, SkillSummary } from "../../lib/dsh/connection";
import { t, type MessageKey } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { listRow } from "../../lib/surface";
import { mono } from "../../lib/theme";
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
  type PresetBinding,
} from "./model";
import { presetWriter, presetWriteGap } from "./presets";
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

const TABS: readonly { value: Tab; label: MessageKey }[] = [
  { value: "profile", label: "bot.tab.profile" },
  { value: "runs", label: "bot.tab.runs" },
  { value: "skills", label: "bot.tab.skills" },
  { value: "plugins", label: "bot.tab.plugins" },
];

/** The saved preset's standing, in the words the tab shows. */
const BINDING_LABELS: Record<PresetBinding, MessageKey> = {
  inherit: "bot.binding.inherit",
  bound: "bot.binding.bound",
  custom: "bot.binding.custom",
};

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
      onCancel={closeBotDetails}
      onOpenChange={({ open }) => {
        if (!open) closeBotDetails();
      }}
    >
      <DialogContent width={660} accessibilityLabel={t("bot.details")} style={{ maxHeight: "92%" }}>
        <If when={botId()}>{(id) => <Body botId={id()} onClose={closeBotDetails} />}</If>
      </DialogContent>
    </Dialog>
  );
}

function Body(props: { botId: string; onClose: () => void }) {
  const bot = (): Bot | null => registry().bots.find((item) => item.id === props.botId) ?? null;
  const template = (): BotTemplate | null => {
    const id = bot()?.templateId;
    return registry().templates.find((item) => item.id === id) ?? null;
  };
  const binding = (): { presetId: string; binding: PresetBinding } | null => {
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
  /** Whether the Host has the `botPresets` Remote. */
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
      failure.set(t("registry.nameEmpty"));
      return;
    }
    const wantsPlugins = pluginsDirty();
    const wantsSkills = skillsDirty();
    if ((wantsPlugins || wantsSkills) && !writable()) {
      failure.set(presetWriteGap());
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
      failure.set(actionError() ?? t("bot.saveFailed"));
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
    failure.set(actionError() ?? t("bot.deleteFailed"));
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
    <View testID="bot-details" style={{ gap: 12, flexDirection: "column", maxHeight: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <If when={bot()}>{(current) => <BotMark identity={current().identity} size={28} />}</If>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "600", color: token("foreground") }}>
            {bot()?.name ?? t("bot.details")}
          </Text>
          <Text style={{ fontSize: 11, color: token("faint") }}>
            {bot()?.archived ? t("bot.detailsArchived") : t("bot.details")}
          </Text>
        </View>
        <Pressable
          onPress={props.onClose}
          accessibilityLabel={t("bot.closeDetails")}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Icon icon={X} size={14} tint={token("muted-foreground")} />
        </Pressable>
      </View>
      <OptionSegmented
        options={TABS.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
        value={tab()}
        onValueChange={(value) => tab.set(value as Tab)}
        fill
      />
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
        <Text style={{ fontSize: 12, lineHeight: 17, color: token("destructive") }}>
          {failure()}
        </Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <If when={!!bot()}>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving() || savingNow() || !!bot()?.hadDialogue}
            onPress={() => void remove()}
          >
            {t("common.delete")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving() || savingNow()}
            onPress={() => void setArchived(!bot()?.archived)}
          >
            {bot()?.archived ? t("common.unarchive") : t("common.archive")}
          </Button>
        </If>
        <View style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onPress={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={saving() || savingNow()} onPress={() => void save()}>
          {t("common.save")}
        </Button>
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
      <Separator />
      <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
        {t("bot.segment.current")}
      </Text>
      <If
        when={segmentId()}
        else={
          <Text style={{ fontSize: 11, lineHeight: 16, color: token("muted-foreground") }}>
            {t("bot.segment.none")}
          </Text>
        }
      >
        {(sessionId) => (
          <View style={{ gap: 8 }}>
            <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
                {t("bot.segment.workspace")}
              </Text>
              {/* dsh may not have reported the Workspace yet: the line stays
                  rather than collapsing, so the section never reads as cut off. */}
              <Text
                testID="bot-details-path"
                style={{
                  fontSize: 12,
                  color: path() ? token("foreground") : token("faint"),
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
                <Tiny
                  label={copied() ? t("common.copied") : t("bot.segment.copyPath")}
                  onPress={() => copy(path())}
                />
                <If when={canReveal()}>
                  <Tiny label={t("bot.segment.reveal")} onPress={() => void reveal(path())} />
                </If>
              </View>
            </If>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
              <Text style={{ width: 72, fontSize: 11, color: token("muted-foreground") }}>
                {t("bot.model")}
              </Text>
              <Text
                testID="bot-details-model"
                style={{ flex: 1, fontSize: 12, color: token("foreground"), numberOfLines: 1 }}
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
            <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
              {t("bot.segment.noContext")}
            </Text>
          }
        >
          {(read) => (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 11, color: token("muted-foreground") }}>
                  {t("bot.segment.context")}
                </Text>
                <Text
                  testID="bot-details-context"
                  style={{
                    fontSize: 11,
                    color: token("foreground"),
                    fontVariant: ["tabular-nums"],
                  }}
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
        <Text style={{ fontSize: 11, lineHeight: 16, color: token("destructive") }}>
          {failure()}
        </Text>
      </If>
      <If when={props.read().status === "idle" || props.read().status === "loading"}>
        <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
          {props.read().status === "loading"
            ? t("bot.segment.usageLoading")
            : t("bot.segment.usageIdle")}
        </Text>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={props.compactRead().status === "running"}
          onPress={props.onCompact}
        >
          {props.compactRead().status === "running"
            ? t("bot.segment.compacting")
            : t("bot.segment.compact")}
        </Button>
        <If
          when={props.compactRead().status !== "idle" && props.compactRead().status !== "running"}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 11,
              lineHeight: 16,
              color:
                props.compactRead().status === "failed"
                  ? token("destructive")
                  : token("muted-foreground"),
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
    <Pressable onPress={props.onPress} accessibilityLabel={props.label} hitSlop={8}>
      <Text style={{ fontSize: 11, fontWeight: "500", color: token("brand") }}>{props.label}</Text>
    </Pressable>
  );
}

function ProfileTab(props: {
  name: Signal<string>;
  description: Signal<string>;
  identity: Signal<BotIdentity>;
  template: () => BotTemplate | null;
  binding: () => { presetId: string; binding: PresetBinding } | null;
  ready: () => boolean;
}) {
  const binding = () => props.binding()?.binding ?? null;
  const tone = () =>
    binding() === "bound"
      ? token("brand")
      : binding() === "custom"
        ? token("info")
        : token("muted-foreground");
  return (
    <View style={{ gap: 12 }}>
      <If when={props.ready()} else={<Hint text={t("bot.readingRegistry")} />}>
        <Field>
          <FieldLabel>{t("common.name")}</FieldLabel>
          <Input
            testID="bot-details-name"
            accessibilityLabel={t("common.name")}
            value={props.name()}
            placeholder="Ada"
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => props.name.set(event.value)}
          />
        </Field>
        <Field>
          <FieldLabel>{t("common.description")}</FieldLabel>
          <Input
            testID="bot-details-description"
            accessibilityLabel={t("common.description")}
            value={props.description()}
            placeholder={t("bot.field.descriptionPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => props.description.set(event.value)}
          />
        </Field>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <BotMark identity={props.identity()} size={22} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
              {t("bot.identity")}
            </Text>
          </View>
          <BotIdentityPicker
            identity={() => props.identity()}
            onChange={(next) => props.identity.set(next)}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
            {t("bot.template")}
          </Text>
          <Text style={{ fontSize: 14, color: token("foreground") }}>
            {props.template()?.name ?? t("bot.templateGone")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                fontSize: 12,
                color: token("foreground"),
                fontFamily: mono,
                userSelect: "text",
              }}
            >
              {props.binding()?.presetId ?? "—"}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: tone() }}>
              {binding() ? t(BINDING_LABELS[binding()!]) : ""}
            </Text>
          </View>
          <Hint text={t("bot.bindingHint")} />
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
        <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
          {t("bot.model")}
        </Text>
        <If when={props.models().length > 0} else={<Hint text={t("bot.modelNoCatalog")} />}>
          <RadioGroup accessibilityLabel={t("bot.model")}>
            <View style={{ gap: 1 }}>
              <Each of={props.models()}>
                {(item) => (
                  <Radio
                    {...listRow({ first: true })}
                    checked={props.modelKey() === item().key}
                    accessibilityLabel={item().label}
                    onChange={() => {
                      props.modelKey.set(item().key);
                      props.thinking.set("");
                    }}
                  >
                    <View style={{ gap: 1, flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12, fontWeight: "500", numberOfLines: 1 }}>
                        {item().label}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: token("muted-foreground"),
                          fontFamily: mono,
                          numberOfLines: 1,
                        }}
                      >
                        {item().key}
                      </Text>
                    </View>
                  </Radio>
                )}
              </Each>
            </View>
          </RadioGroup>
        </If>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
          {t("bot.thinking")}
        </Text>
        <If when={props.levels().length > 0} else={<Hint text={t("bot.thinkingNone")} />}>
          <OptionSegmented
            options={[
              { value: "", label: t("common.default") },
              ...props.levels().map((item) => ({ value: item.id, label: item.name })),
            ]}
            value={props.thinking()}
            onValueChange={(value) => props.thinking.set(value)}
            fill
          />
        </If>
      </View>
      <Field>
        <FieldLabel>{t("bot.defaultWorkspace")}</FieldLabel>
        <Input
          testID="bot-details-workspace"
          accessibilityLabel={t("bot.defaultWorkspace")}
          value={props.workspace()}
          placeholder="/path/to/project"
          autoCapitalize="none"
          autoCorrect={false}
          onChange={(event) => props.workspace.set(event.value)}
        />
      </Field>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button size="sm" variant="secondary" onPress={props.onChooseWorkspace}>
          {t("bot.chooseDirectory")}
        </Button>
      </View>
      <Hint text={t("bot.defaultWorkspaceHint")} />
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
      <SectionTitle title={t("bot.skills.base")} />
      <If when={props.skills() === null} else={null}>
        <View role="progressbar" accessibilityLabel={t("common.reading")} style={{ gap: 6 }}>
          <Skeleton style={{ width: 180, height: 14 }} />
          <Skeleton style={{ width: 140, height: 14 }} />
        </View>
      </If>
      <If when={base().length > 0} else={<Hint text={t("bot.skills.baseEmpty")} />}>
        <View style={{ gap: 1 }}>
          <Each of={base()}>
            {(skill) => <Row label={`/${skill().name}`} detail={skill().description || "—"} />}
          </Each>
        </View>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <SectionTitle title={t("bot.skills.added")} />
        <View style={{ flex: 1 }} />
        <Button size="sm" variant="secondary" disabled={!props.writable()} onPress={props.onAdd}>
          {t("bot.skills.add")}
        </Button>
      </View>
      <If when={props.added().length > 0} else={<Hint text={t("bot.skills.none")} />}>
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
                  borderBottomColor: token("line"),
                }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 12, color: token("foreground"), fontFamily: mono }}>
                    {`/${skill().name}`}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: token("muted-foreground"), numberOfLines: 1 }}
                  >
                    {skill().path}
                  </Text>
                </View>
                <Pressable
                  onPress={() => props.onRemove(skill().path)}
                  accessibilityLabel={t("bot.skills.remove", { name: skill().name })}
                  disabled={!props.writable()}
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: token("destructive") }}>
                    {t("common.remove")}
                  </Text>
                </Pressable>
              </View>
            )}
          </Each>
        </View>
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <If when={!props.writable()}>
        <Hint text={presetWriteGap()} />
      </If>
      <If when={props.writable()}>
        <Hint text={t("bot.skills.hint")} />
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
      <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
        {t("bot.plugins.heading", { preset: props.presetId() || "preset" })}
      </Text>
      <If
        when={(props.preset()?.rows ?? []).length > 0}
        else={<Hint text={t("bot.plugins.none")} />}
      >
        <FieldGroup>
          <Each of={props.preset()?.rows ?? []}>
            {(row, index) => (
              <>
                <If when={index() > 0}>
                  <FieldSeparator />
                </If>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>{row().name ?? row().moduleName}</FieldLabel>
                    <FieldDescription style={{ fontFamily: mono, numberOfLines: 1 }}>
                      {row().moduleName}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    accessibilityLabel={t("bot.plugins.toggle", {
                      name: row().name ?? row().moduleName,
                    })}
                    checked={enabledOf(row())}
                    disabled={!props.writable()}
                    onChange={() => props.onToggle(row())}
                  />
                </Field>
              </>
            )}
          </Each>
        </FieldGroup>
      </If>
      <If when={!!props.preset()?.broken}>
        <Hint text={props.preset()?.broken ?? ""} />
      </If>
      <If when={!!props.note()}>
        <Hint text={props.note() ?? ""} />
      </If>
      <If when={!props.writable()}>
        <Hint text={presetWriteGap()} />
      </If>
      <If when={props.writable()}>
        <Hint text={t("bot.plugins.hint")} />
      </If>
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
        borderBottomColor: token("line"),
      }}
    >
      <Text style={{ fontSize: 12, color: token("foreground"), fontFamily: mono }}>
        {props.label}
      </Text>
      <Text style={{ fontSize: 11, color: token("muted-foreground"), numberOfLines: 2 }}>
        {props.detail}
      </Text>
    </View>
  );
}

function SectionTitle(props: { title: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
      {props.title}
    </Text>
  );
}

function Hint(props: { text: string }) {
  return (
    <Text style={{ fontSize: 11, lineHeight: 16, color: token("muted-foreground") }}>
      {props.text}
    </Text>
  );
}
