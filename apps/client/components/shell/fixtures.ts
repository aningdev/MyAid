import type { TreeItem } from "nsh/base";

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

const botAid = addr("bots", ["bot-aid"], "Aid", "bot");
const botCoder = addr("bots", ["bot-coder"], "Coder", "bot");
const dlgAidHome = addr("bots", ["bot-aid", "dlg-home"], "Aid · Home", "dialogue");
const dlgAidCode = addr("bots", ["bot-aid", "dlg-code"], "Aid · Codebase", "dialogue");
const dlgCoderApp = addr("bots", ["bot-coder", "dlg-app"], "Coder · App", "dialogue");

const dlgHome = addr("dialogues", ["dlg-home"], "Aid · Home", "dialogue");
const dlgCode = addr("dialogues", ["dlg-code"], "Aid · Codebase", "dialogue");
const dlgApp = addr("dialogues", ["dlg-app"], "Coder · App", "dialogue");
const sessHomeMain = addr("dialogues", ["dlg-home", "sess-main"], "Main context", "session");
const sessHomeBug = addr("dialogues", ["dlg-home", "sess-bug"], "Bug hunt", "session");
const sessCodeMain = addr("dialogues", ["dlg-code", "sess-main"], "Main context", "session");
const sessAppMain = addr("dialogues", ["dlg-app", "sess-main"], "Main context", "session");

const setGeneral = addr("settings", ["general", "appearance"], "Appearance", "setting");
const setBg = addr("settings", ["general", "background"], "Background", "setting");
const setHost = addr("settings", ["runtime", "host"], "Host", "setting");

const actions = new Map<string, NavAction>();

function leaf(id: string, label: string, action: NavAction): TreeItem {
  actions.set(id, action);
  return { id, label };
}

function folder(id: string, label: string, children: TreeItem[]): TreeItem {
  return { id, label, children };
}

/** Fake Navigator tree for `nsh/base` Tree. */
export const NAV_TREE_ITEMS: TreeItem[] = [
  folder("root:favorites", "Favorites", [
    leaf("fav:dlg-home", "Aid · Home", {
      type: "address",
      address: { ...dlgHome, id: "favorites:dlg-home", root: "favorites", kind: "favorite" },
    }),
    leaf("fav:mail-inbox", "Inbox", {
      type: "address",
      address: { ...mailInbox, id: "favorites:mail-inbox", root: "favorites", kind: "favorite" },
    }),
    leaf("fav:task-today", "Today", {
      type: "address",
      address: { ...taskActive, id: "favorites:task-today", root: "favorites", kind: "favorite" },
    }),
  ]),
  folder("root:mail", "Mail", [
    folder("mail:personal", "Personal", [
      leaf(mailInbox.id, mailInbox.title, { type: "address", address: mailInbox }),
      leaf(mailArchive.id, mailArchive.title, { type: "address", address: mailArchive }),
    ]),
    folder("mail:work", "Work", [
      leaf(mailWork.id, mailWork.title, { type: "address", address: mailWork }),
    ]),
  ]),
  folder("root:task", "Task", [
    folder("task:active", "Active", [
      leaf(taskActive.id, taskActive.title, { type: "address", address: taskActive }),
      leaf(taskLater.id, taskLater.title, { type: "address", address: taskLater }),
    ]),
    folder("task:archive", "Archive", [
      leaf(taskDone.id, taskDone.title, { type: "address", address: taskDone }),
    ]),
  ]),
  folder("root:knowledge", "Knowledge", [
    folder("know:docs", "Docs", [
      leaf(knowDocs.id, knowDocs.title, { type: "address", address: knowDocs }),
      leaf(knowNotes.id, knowNotes.title, { type: "address", address: knowNotes }),
    ]),
    folder("know:refs", "Refs", [
      leaf(knowRefs.id, knowRefs.title, { type: "address", address: knowRefs }),
    ]),
  ]),
  folder("root:bots", "Bots", [
    folder(botAid.id, botAid.title, [
      leaf(dlgAidHome.id, "Home", { type: "address", address: dlgAidHome }),
      leaf(dlgAidCode.id, "Codebase", { type: "address", address: dlgAidCode }),
    ]),
    folder(botCoder.id, botCoder.title, [
      leaf(dlgCoderApp.id, "App", { type: "address", address: dlgCoderApp }),
    ]),
  ]),
  folder("root:dialogues", "Dialogues", [
    folder(dlgHome.id, dlgHome.title, [
      leaf(sessHomeMain.id, sessHomeMain.title, { type: "address", address: sessHomeMain }),
      leaf(sessHomeBug.id, sessHomeBug.title, { type: "address", address: sessHomeBug }),
    ]),
    folder(dlgCode.id, dlgCode.title, [
      leaf(sessCodeMain.id, sessCodeMain.title, { type: "address", address: sessCodeMain }),
    ]),
    folder(dlgApp.id, dlgApp.title, [
      leaf(sessAppMain.id, sessAppMain.title, { type: "address", address: sessAppMain }),
    ]),
  ]),
  folder("root:spaces", "Spaces", [
    leaf("space-focus", "Focus Dialogue", { type: "space", spaceId: "space-focus" }),
    leaf("space-split", "Mail | Dialogue", { type: "space", spaceId: "space-split" }),
  ]),
  folder("root:settings", "Settings", [
    folder("set:general", "General", [
      leaf(setGeneral.id, setGeneral.title, { type: "address", address: setGeneral }),
      leaf(setBg.id, setBg.title, { type: "address", address: setBg }),
    ]),
    folder("set:runtime", "Runtime", [
      leaf(setHost.id, setHost.title, { type: "address", address: setHost }),
    ]),
  ]),
];

/** Default expanded section roots. */
export const NAV_DEFAULT_EXPANDED: string[] = [
  "root:favorites",
  "root:bots",
  "root:dialogues",
  "root:spaces",
];

export function navActionForId(id: string): NavAction | undefined {
  return actions.get(id);
}

/** Kind hint for Tree row icons (by item id prefix / known actions). */
export function navKindForId(id: string): NavAddress["kind"] | "section" | "folder" {
  if (id.startsWith("root:")) return "section";
  const action = actions.get(id);
  if (action?.type === "space") return "space";
  if (action?.type === "address") return action.address.kind;
  return "folder";
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
    contents: { "p-focus": dlgHome },
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
    contents: { "p-split-l": mailInbox, "p-split-r": dlgHome },
  },
];

export function spaceById(id: string): SpaceSnapshot | undefined {
  return SPACE_FIXTURES.find((s) => s.id === id);
}
