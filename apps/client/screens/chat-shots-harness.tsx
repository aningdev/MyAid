/**
 * The conversation's pictures, over fixtures and the real `Transcript`: a
 * segment divider, a message the person sent with its attachments, a reply
 * with reasoning, a group of tool steps opened and one call closed, Markdown
 * with a code block, and a reply still being written. No Host is involved.
 */
import { mount, signal, token, View } from "nsh";

import type { RowHandlers } from "../features/dialogue/chat/MessageRow";
import { buildConversationRows, type SegmentInput } from "../features/dialogue/chat/rows";
import type { Msg, Tool } from "../features/dialogue/chat/scripts";
import { Transcript } from "../features/dialogue/chat/Transcript";

const now = Date.now();

/** A tiny landscape, so the attachment has a picture to draw. */
const photo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fb9ff"/><stop offset="1" stop-color="#3355aa"/></linearGradient></defs><rect width="200" height="150" fill="url(#g)"/><circle cx="150" cy="42" r="18" fill="#ffe9a8"/><path d="M0 150 L58 74 L104 128 L142 96 L200 150 Z" fill="#1d2b4d"/></svg>`,
  );

const tool = (id: string, name: string, args: string, result: string): Tool => ({
  id,
  kind: "generic",
  state: "done",
  name,
  arguments: args,
  result,
});

const earlier: Msg[] = [
  {
    kind: "user",
    id: "u0",
    at: now - 3_600_000,
    text: "Where does the Viewer keep its zoom?",
  },
  {
    kind: "assistant",
    id: "a0",
    at: now - 3_540_000,
    model: "Deep",
    script: "",
    tools: [],
    md: "In `ImageViewer`, the zoom lives on the scroll view's own scale.",
    status: "done",
  },
];

const current: Msg[] = [
  {
    kind: "user",
    id: "u1",
    at: now - 120_000,
    text: "Summarise what changed in the Viewer, and keep the API stable.",
    file: { name: "notes.md", size: "12 KB" },
    image: photo,
  },
  {
    kind: "assistant",
    id: "a1",
    at: now - 96_000,
    model: "Deep",
    script: "",
    reasoning: {
      text: "The Viewer's press handlers moved out of the frame; the props did not change.",
      seconds: 4,
      open: false,
    },
    tools: [
      tool("t1", "read_file", '{"path":"components/app/ImageViewer.tsx"}', "184 lines"),
      tool("t2", "grep", '{"pattern":"zoom","path":"components/app"}', "9 matches"),
      tool("t3", "bash", '{"command":"bun test"}', "212 pass"),
    ],
    md: [
      "## What changed",
      "",
      "The Viewer now keeps its zoom on the scroll view, and its presses moved out of the frame.",
      "",
      "```ts",
      "export function ImageViewer(props: { image: ViewImage; onClose: () => void }) {",
      "  const scale = createAnimatedValue(1);",
      "  return <Scroll zoomable onZoom={(event) => scale.set(event.scale)} />;",
      "}",
      "```",
      "",
      "| Region | Before | After |",
      "| --- | --- | --- |",
      "| Frame | 320 × 240 | fits the window |",
      "| Zoom | fixed | 1 – 4, pinch |",
      "",
      "Nothing in the props changed: `image` and `onClose` are as they were.",
    ].join("\n"),
    status: "done",
  },
  {
    kind: "assistant",
    id: "a2",
    at: now - 40_000,
    model: "Deep",
    script: "",
    tools: [tool("t4", "read_file", '{"path":"components/ui/attachment.tsx"}', "381 lines")],
    md: "Reading the attachment's parts to see which one the chip can stand in for…",
    status: "done",
  },
  {
    kind: "assistant",
    id: "a3",
    at: now - 4_000,
    model: "Deep",
    script: "",
    tools: [],
    md: "The chip keeps its 32-point frame, and the picture stays a square beside the name",
    status: "done",
  },
];

const segments: SegmentInput[] = [
  {
    sessionId: "s0",
    label: "Mar 3",
    path: "~/proj-a",
    fullPath: "/Users/someone/proj-a",
    current: false,
    messages: earlier,
  },
  {
    sessionId: "s1",
    label: "Today",
    path: "~/work/myaid",
    fullPath: "/Users/someone/work/myaid",
    current: true,
    messages: current,
  },
];

/** The steps group is open, the single call is closed: both are in one picture. */
const open = new Set(["a1:steps"]);

const handlers: RowHandlers = {
  isOpen: (key) => open.has(key),
  onToggle: (key) => {
    if (open.has(key)) open.delete(key);
    else open.add(key);
  },
  onRetry: () => {},
  onRegenerate: () => {},
  onRate: () => {},
  copied: () => null,
  onCopy: () => {},
};

const rows = () =>
  buildConversationRows({
    segments,
    liveId: "a3",
    running: false,
    since: null,
    now: Date.now(),
  });

function Harness() {
  const following = signal(true);
  return (
    <View style={{ flex: 1, backgroundColor: token("background") }}>
      <Transcript
        rows={rows}
        botName={() => "Ada"}
        bot={() => null}
        now={() => Date.now()}
        handlers={handlers}
        following={following}
        streaming={() => true}
        loadingOlder={() => false}
        onScrollState={(state) => following.set(state.following)}
        onLoadOlder={() => {}}
        handle={() => {}}
      />
    </View>
  );
}

mount(Harness);
