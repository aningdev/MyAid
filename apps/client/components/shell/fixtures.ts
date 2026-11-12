/**
 * Parked Navigator sections (Favorites, Mail, Task, Knowledge, Spaces,
 * Settings) and the Spaces' layout snapshots. Bots and Dialogues are no
 * fixtures: `navData` projects them from the registry.
 */
import type { TreeItem } from "nsh/base";

import { dialogueAddress } from "./navAddresses";
import type { NavAction, NavAddress, ShellRoot, SpaceSnapshot } from "./types";

function addr(
  root: ShellRoot,
  path: string[],
  title: string,
  kind: NavAddress["kind"],
): NavAddress {
  return { id: `${root}:${path.join("/")}`, root, path, title, kind };
}

const mailInbox = addr("mail", ["personal", "inbox"], "Inbox", "folder");
const mailArchive = addr("mail", ["personal", "archive"], "Archive", "folder");
const mailWork = addr("mail", ["work", "inbox"], "Work Inbox", "folder");
const taskActive = addr("task", ["active", "today"], "Today", "folder");
const taskLater = addr("task", ["active", "later"], "Later", "folder");
const taskDone = addr("task", ["archive", "done"], "Done", "folder");
const knowDocs = addr("knowledge", ["docs", "guides"], "Guides", "folder");
const knowNotes = addr("knowledge", ["docs", "notes"], "Notes", "folder");
const knowRefs = addr("knowledge", ["refs", "papers"], "Papers", "folder");

const setGeneral = addr("settings", ["general", "appearance"], "Appearance", "setting");
const setBg = addr("settings", ["general", "background"], "Background", "setting");
const setHost = addr("settings", ["runtime", "host"], "Host", "setting");

/** A Dialogue for the Spaces' layouts. It is a fixture: the registry may not have it. */
const dlgFixture = dialogueAddress({
  id: "dlg-fixture",
  workspacePath: "/Users/you/Work/home",
  botName: "Aid",
});

const actions = new Map<string, NavAction>();

function leaf(id: string, label: string, action: NavAction): TreeItem {
  actions.set(id, action);
  return { id, label };
}

function folder(id: string, label: string, children: TreeItem[], action?: NavAction): TreeItem {
  if (action) actions.set(id, action);
  return { id, label, children };
}

/** The parked sections, by shell root. Order comes from `navData`; Favorites is real. */
export const PARKED_NAV: Record<"mail" | "task" | "knowledge" | "spaces" | "settings", TreeItem> = {
  mail: folder("root:mail", "Mail", [
    folder("mail:personal", "Personal", [
      leaf(mailInbox.id, mailInbox.title, { type: "address", address: mailInbox }),
      leaf(mailArchive.id, mailArchive.title, { type: "address", address: mailArchive }),
    ]),
    folder("mail:work", "Work", [
      leaf(mailWork.id, mailWork.title, { type: "address", address: mailWork }),
    ]),
  ]),
  task: folder("root:task", "Task", [
    folder("task:active", "Active", [
      leaf(taskActive.id, taskActive.title, { type: "address", address: taskActive }),
      leaf(taskLater.id, taskLater.title, { type: "address", address: taskLater }),
    ]),
    folder("task:archive", "Archive", [
      leaf(taskDone.id, taskDone.title, { type: "address", address: taskDone }),
    ]),
  ]),
  knowledge: folder("root:knowledge", "Knowledge", [
    folder("know:docs", "Docs", [
      leaf(knowDocs.id, knowDocs.title, { type: "address", address: knowDocs }),
      leaf(knowNotes.id, knowNotes.title, { type: "address", address: knowNotes }),
    ]),
    folder("know:refs", "Refs", [
      leaf(knowRefs.id, knowRefs.title, { type: "address", address: knowRefs }),
    ]),
  ]),
  spaces: folder("root:spaces", "Spaces", [
    leaf("space-focus", "Focus Dialogue", { type: "space", spaceId: "space-focus" }),
    leaf("space-split", "Mail | Dialogue", { type: "space", spaceId: "space-split" }),
  ]),
  settings: folder("root:settings", "Settings", [
    folder("set:general", "General", [
      leaf(setGeneral.id, setGeneral.title, { type: "address", address: setGeneral }),
      leaf(setBg.id, setBg.title, { type: "address", address: setBg }),
    ]),
    folder("set:runtime", "Runtime", [
      leaf(setHost.id, setHost.title, { type: "address", address: setHost }),
    ]),
  ]),
};

/** A parked node's action (Spaces apply; the rest open addresses). */
export function parkedActionForId(id: string): NavAction | undefined {
  return actions.get(id);
}

/** Default expanded section roots. */
export const NAV_DEFAULT_EXPANDED: string[] = [
  "root:favorites",
  "root:bots",
  "root:dialogues",
  "root:spaces",
];

/** A Navigator Section's title, by its root. */
const ROOT_LABELS: Record<ShellRoot, string> = {
  favorites: "Favorites",
  mail: "Mail",
  task: "Task",
  knowledge: "Knowledge",
  bots: "Bots",
  dialogues: "Dialogues",
  spaces: "Spaces",
  settings: "Settings",
};

export function rootLabel(root: ShellRoot): string {
  return ROOT_LABELS[root] ?? root;
}

export const SPACE_FIXTURES: SpaceSnapshot[] = [
  {
    id: "space-focus",
    title: "Focus Dialogue",
    activePanelId: "p-focus",
    layout: {
      center: {
        type: "split",
        axis: "horizontal",
        children: [{ type: "tabs", panels: ["p-focus"], activeIndex: 0 }],
        sizes: [null],
      },
    },
    contents: { "p-focus": dlgFixture },
  },
  {
    id: "space-split",
    title: "Mail | Dialogue",
    activePanelId: "p-split-r",
    layout: {
      center: {
        type: "split",
        axis: "horizontal",
        children: [
          { type: "tabs", panels: ["p-split-l"], activeIndex: 0 },
          { type: "tabs", panels: ["p-split-r"], activeIndex: 0 },
        ],
        sizes: [null, null],
      },
    },
    contents: { "p-split-l": mailInbox, "p-split-r": dlgFixture },
  },
];

export function spaceById(id: string): SpaceSnapshot | undefined {
  return SPACE_FIXTURES.find((s) => s.id === id);
}
