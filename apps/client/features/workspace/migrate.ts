/**
 * Registry v4 → v5: hand what dsh already owns to dsh. Each v4 Dialogue names
 * a path; the Workspace over that path takes the path and the name, and the
 * archive flags and pins move to dsh's archive and pin sets. The registry
 * keeps only `{ id, botId, workspaceId }` and the claims.
 *
 * The migration is idempotent and resumable: `workspace.create` returns the
 * existing Workspace for the same canonical path, archiving an archived id and
 * pinning a pinned id are no-ops, and the file is written once at the end, so
 * an interrupted run starts over from the untouched v4 file. It runs in four
 * phases — Workspaces, names, archives, pins — each of which uses only what
 * the one before it resolved.
 */
import type { BotRegistry, LegacyDialogue, LegacyRegistry } from "../bots/model";
import { REGISTRY_VERSION } from "../bots/model";
import { pathSegment } from "./paths";

/** What the migration needs from dsh; tests drive these steps directly. */
export type WorkspaceBridge = {
  /** Create or reuse the Workspace over `path`. */
  create(path: string): Promise<{ workspaceId: string; title: string }>;
  /** Replace the Workspace title. */
  rename(workspaceId: string, title: string): Promise<void>;
  /** Add one Session to dsh's archive set (idempotent). */
  archiveSession(sessionId: string): Promise<void>;
  /** Add one Session to dsh's pin set (idempotent). */
  pinSession(sessionId: string): Promise<void>;
  /** The archive set as dsh reports it now. */
  archived(): ReadonlySet<string>;
  /** The pin set as dsh reports it now. */
  pinned(): readonly string[];
  /** Resolve once the follow baseline has arrived (the sets above are real). */
  ready?(): Promise<void>;
};

/** Pins that lived in the shell's Favorites before v5 (session addresses). */
export type LegacyPins = readonly string[];

export type MigrationReport = {
  dialogues: number;
  workspaces: number;
  renamed: number;
  archived: number;
  pinned: number;
  /**
   * Names or Sessions dsh would not take: a title another Workspace already
   * holds, a name a second Dialogue on the same Workspace cannot own, a
   * Session whose log dsh no longer knows. The Dialogue still migrates.
   */
  skipped: number;
};

/** A Dialogue bound to the Workspace its path resolved to. */
type Placement = {
  dialogue: LegacyDialogue;
  workspaceId: string;
  title: string;
};

/** The Workspace title dsh derives for a fresh record: the last path segment. */
export function defaultWorkspaceTitle(path: string): string {
  return pathSegment(path);
}

/**
 * Migrate one v4 registry in place of its Dialogues' paths. Nothing is
 * written here: the caller stores the returned v5 registry.
 */
export async function migrateRegistry(
  legacy: LegacyRegistry,
  bridge: WorkspaceBridge,
  pins: LegacyPins = [],
): Promise<{ registry: BotRegistry; report: MigrationReport }> {
  await bridge.ready?.();
  const report: MigrationReport = {
    dialogues: legacy.dialogues.length,
    workspaces: 0,
    renamed: 0,
    archived: 0,
    pinned: 0,
    skipped: 0,
  };
  const placements = await placeWorkspaces(legacy, bridge, report);
  await applyNames(placements, bridge, report);
  await applyArchives(placements, bridge, report);
  await applyPins(pins, bridge, report);
  return {
    registry: {
      version: REGISTRY_VERSION,
      templates: legacy.templates,
      bots: legacy.bots,
      dialogues: placements.map((placement) => ({
        id: placement.dialogue.id,
        botId: placement.dialogue.botId,
        workspaceId: placement.workspaceId,
        claims: placement.dialogue.claims.map((claim) => ({
          sessionId: claim.sessionId,
          title: claim.title,
        })),
      })),
    },
    report,
  };
}

/** Phase 1: every Dialogue's path resolves to a Workspace (created or reused). */
async function placeWorkspaces(
  legacy: LegacyRegistry,
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<Placement[]> {
  const placements: Placement[] = [];
  for (const dialogue of legacy.dialogues) {
    const workspace = await bridge.create(dialogue.workspacePath);
    report.workspaces++;
    placements.push({ dialogue, workspaceId: workspace.workspaceId, title: workspace.title });
  }
  return placements;
}

/**
 * Phase 2: a v4 name becomes the Workspace title, but only while the
 * Workspace still carries dsh's default title and only for the first Dialogue
 * that asks for it — two Bots on one directory share one title. Every name
 * that cannot be applied is counted, so a partial outcome is reportable.
 */
async function applyNames(
  placements: readonly Placement[],
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<void> {
  const titled = new Set<string>();
  for (const placement of placements) {
    const name = placement.dialogue.name?.trim();
    if (!name) continue;
    const drawn = titled.has(placement.workspaceId);
    titled.add(placement.workspaceId);
    if (drawn) {
      // A second Dialogue on the same Workspace cannot own the shared title.
      report.skipped++;
      continue;
    }
    if (name === placement.title) continue;
    if (placement.title !== defaultWorkspaceTitle(placement.dialogue.workspacePath)) {
      // Someone already retitled the Workspace in dsh: the old name loses.
      report.skipped++;
      continue;
    }
    try {
      await bridge.rename(placement.workspaceId, name);
      report.renamed++;
    } catch {
      // dsh refuses a title another Workspace already holds.
      report.skipped++;
    }
  }
}

/** Phase 3: archived claims join dsh's archive set. */
async function applyArchives(
  placements: readonly Placement[],
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<void> {
  const archived = new Set(bridge.archived());
  for (const placement of placements) {
    for (const claim of placement.dialogue.claims) {
      if (!claim.archived || archived.has(claim.sessionId)) continue;
      try {
        await bridge.archiveSession(claim.sessionId);
        archived.add(claim.sessionId);
        report.archived++;
      } catch {
        // A Session dsh no longer knows cannot be archived; the claim stays.
        report.skipped++;
      }
    }
  }
}

/** Phase 4: Session pins that lived in Favorites join dsh's pin set. */
async function applyPins(
  pins: LegacyPins,
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<void> {
  const pinned = new Set(bridge.pinned());
  for (const sessionId of pins) {
    if (pinned.has(sessionId)) continue;
    try {
      await bridge.pinSession(sessionId);
      pinned.add(sessionId);
      report.pinned++;
    } catch {
      // A pin for a Session dsh does not know is dropped, not fatal.
      report.skipped++;
    }
  }
}
