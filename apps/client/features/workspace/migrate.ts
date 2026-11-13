/**
 * Registry v4 → v5: hand what dsh already owns to dsh. Each v4 Dialogue names
 * a path; the Workspace over that path takes the path and the name, and the
 * archive flags and pins move to dsh's archive and pin sets. The registry
 * keeps only `{ id, botId, workspaceId }` and the claims.
 *
 * The migration is idempotent and resumable: `workspace.create` returns the
 * existing Workspace for the same canonical path, archiving an archived id and
 * pinning a pinned id are no-ops, and the file is written once at the end, so
 * an interrupted run starts over from the untouched v4 file.
 */
import type { BotRegistry, LegacyRegistry } from "../bots/model";
import { REGISTRY_VERSION } from "../bots/model";

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
   * Best-effort steps dsh refused (a title already taken, a Session its
   * registry no longer knows). The Dialogue still migrates; the refused part
   * stays as dsh has it.
   */
  skipped: number;
};

/** The Workspace title dsh derives for a fresh record: the last path segment. */
export function defaultWorkspaceTitle(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  if (!trimmed) return path.trim();
  const at = trimmed.lastIndexOf("/");
  return at >= 0 ? trimmed.slice(at + 1) || trimmed : trimmed;
}

/**
 * Migrate one v4 registry, in place of its Dialogues' paths. Nothing is
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
  const drawnTitles = new Set<string>();
  const dialogues: BotRegistry["dialogues"] = [];
  for (const dialogue of legacy.dialogues) {
    const workspace = await bridge.create(dialogue.workspacePath);
    report.workspaces++;
    const name = dialogue.name?.trim();
    const drawn = drawnTitles.has(workspace.workspaceId);
    drawnTitles.add(workspace.workspaceId);
    // Move a name only over a Workspace that still carries dsh's own title,
    // and only for the first Dialogue on that Workspace: two Bots on one
    // directory share one title.
    if (
      name &&
      !drawn &&
      name !== workspace.title &&
      workspace.title === defaultWorkspaceTitle(dialogue.workspacePath)
    ) {
      try {
        await bridge.rename(workspace.workspaceId, name);
        report.renamed++;
      } catch {
        // dsh refuses a title another Workspace already holds: the Dialogue
        // keeps the default title rather than failing the whole migration.
        report.skipped++;
      }
    }
    const archivedNow = bridge.archived();
    for (const claim of dialogue.claims) {
      if (!claim.archived || archivedNow.has(claim.sessionId)) continue;
      try {
        await bridge.archiveSession(claim.sessionId);
        report.archived++;
      } catch {
        // A Session dsh no longer knows cannot be archived; the claim stays.
        report.skipped++;
      }
    }
    dialogues.push({
      id: dialogue.id,
      botId: dialogue.botId,
      workspaceId: workspace.workspaceId,
      claims: dialogue.claims.map((claim) => ({
        sessionId: claim.sessionId,
        title: claim.title,
      })),
    });
  }
  // Session pins lived in the shell's Favorites: they move into dsh's pin set.
  const pinnedNow = new Set(bridge.pinned());
  for (const sessionId of pins) {
    if (pinnedNow.has(sessionId)) continue;
    try {
      await bridge.pinSession(sessionId);
      pinnedNow.add(sessionId);
      report.pinned++;
    } catch {
      // A pin for a Session dsh does not know is dropped, not fatal.
      report.skipped++;
    }
  }
  return {
    registry: {
      version: REGISTRY_VERSION,
      templates: legacy.templates,
      bots: legacy.bots,
      dialogues,
    },
    report,
  };
}
