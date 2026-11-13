/**
 * Registry before v6 → v6: one Bot, one long conversation. A v3 / v4 Dialogue
 * names a path; the Workspace over that path takes the path, the name and the
 * archived claims. A v5 Dialogue already names a Workspace, and its claims
 * become segments directly. Either way every claimed Session becomes one
 * segment, in file order (the order the Sessions were claimed), and its
 * Workspace id stays on that segment.
 *
 * Archived Sessions are kept: the migration **unarchives** them in dsh, so the
 * Bot's transcript is complete. There is no per-segment archive in the product.
 *
 * The migration is idempotent and resumable: `workspace.create` returns the
 * existing Workspace for the same canonical path, unarchiving an unarchived id
 * is a no-op, and the file is written once at the end, so an interrupted run
 * starts over from the untouched old file.
 */
import type {
  Bot,
  BotRegistry,
  LegacyDialogue,
  LegacyRegistry,
  PreviousDialogue,
  Segment,
} from "../bots/model";
import { REGISTRY_VERSION } from "../bots/model";
import { pathSegment } from "./paths";

/** What the migration needs from dsh; tests drive these steps directly. */
export type WorkspaceBridge = {
  /** Create or reuse the Workspace over `path`. */
  create(path: string): Promise<{ workspaceId: string; title: string }>;
  /** Replace the Workspace title. */
  rename(workspaceId: string, title: string): Promise<void>;
  /** Remove one Session from dsh's archive set (idempotent). */
  unarchiveSession(sessionId: string): Promise<void>;
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
  /** Archived Sessions brought back so the long conversation is complete. */
  unarchived: number;
  pinned: number;
  /**
   * Names or Sessions dsh would not take: a title another Workspace already
   * holds, a name a second Dialogue on the same Workspace cannot own, a
   * Session whose log dsh no longer knows. Its segment still migrates.
   */
  skipped: number;
};

/** A Dialogue bound to the Workspace its path / id resolved to. */
type Placement = {
  dialogue: LegacyDialogue | PreviousDialogue;
  workspaceId: string;
  title: string;
};

type MigrationClaim = {
  botId: string;
  workspaceId: string;
  sessionId: string;
  title: string | null;
};

/** The Workspace title dsh derives for a fresh record: the last path segment. */
export function defaultWorkspaceTitle(path: string): string {
  return pathSegment(path);
}

function isPathDialogue(dialogue: LegacyDialogue | PreviousDialogue): dialogue is LegacyDialogue {
  return "workspacePath" in dialogue;
}

/**
 * Migrate one old registry into the v6 shape. Nothing is written here: the
 * caller stores the returned registry.
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
    unarchived: 0,
    pinned: 0,
    skipped: 0,
  };
  const placements = await placeWorkspaces(legacy, bridge, report);
  await applyNames(placements, bridge, report);
  const claims = flattenClaims(placements);
  await applyUnarchives(claims, bridge, report);
  await applyPins(pins, bridge, report);
  return {
    registry: {
      version: REGISTRY_VERSION,
      templates: legacy.templates,
      bots: mergeSegments(legacy.bots, claims),
    },
    report,
  };
}

/** Phase 1: every Dialogue resolves to a Workspace (created from a path, or reused). */
async function placeWorkspaces(
  legacy: LegacyRegistry,
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<Placement[]> {
  const placements: Placement[] = [];
  for (const dialogue of legacy.dialogues) {
    if (isPathDialogue(dialogue)) {
      const workspace = await bridge.create(dialogue.workspacePath);
      report.workspaces++;
      placements.push({
        dialogue,
        workspaceId: workspace.workspaceId,
        title: workspace.title,
      });
    } else {
      placements.push({ dialogue, workspaceId: dialogue.workspaceId, title: "" });
    }
  }
  return placements;
}

/**
 * Phase 2 (v3 / v4 only): a name becomes the Workspace title, but only while
 * the Workspace still carries dsh's default title and only for the first
 * Dialogue that asks for it — two Bots on one directory share one title. Every
 * name that cannot be applied is counted, so a partial outcome is reportable.
 */
async function applyNames(
  placements: readonly Placement[],
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<void> {
  const titled = new Set<string>();
  for (const placement of placements) {
    if (!isPathDialogue(placement.dialogue)) continue;
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

/** The Dialogues' claims, in file order: the order the Sessions were claimed. */
function flattenClaims(placements: readonly Placement[]): MigrationClaim[] {
  const claims: MigrationClaim[] = [];
  const seen = new Set<string>();
  for (const placement of placements) {
    for (const claim of placement.dialogue.claims) {
      if (seen.has(claim.sessionId)) continue;
      seen.add(claim.sessionId);
      claims.push({
        botId: placement.dialogue.botId,
        workspaceId: placement.workspaceId,
        sessionId: claim.sessionId,
        title: claim.title,
      });
    }
  }
  return claims;
}

/** Phase 3: archived Sessions come back, so the long conversation is complete. */
async function applyUnarchives(
  claims: readonly MigrationClaim[],
  bridge: WorkspaceBridge,
  report: MigrationReport,
): Promise<void> {
  const archived = new Set(bridge.archived());
  for (const claim of claims) {
    if (!archived.has(claim.sessionId)) continue;
    try {
      await bridge.unarchiveSession(claim.sessionId);
      archived.delete(claim.sessionId);
      report.unarchived++;
    } catch {
      // A Session dsh no longer knows keeps its segment; the archive flag stays.
      report.skipped++;
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

/** Give each Bot the segments that were claimed for it, oldest first. */
function mergeSegments(bots: readonly Bot[], claims: readonly MigrationClaim[]): Bot[] {
  return bots.map((bot) => {
    const segments: Segment[] = claims
      .filter((claim) => claim.botId === bot.id)
      .map((claim) => ({
        sessionId: claim.sessionId,
        workspaceId: claim.workspaceId,
        title: claim.title,
      }));
    return { ...bot, segments };
  });
}
