/**
 * The conversation's pieces, after the change: a segment divider, a message
 * with attachments, a reply with reasoning, tool steps, Markdown and a code
 * block, and a reply being written — light and dark, and the transcript
 * scrolled up with the button that comes back to the end. A headless run
 * stops at the picture probe; a graphical one saves six PNGs:
 *
 *   nsh test screens/chat-components-shots.test.tsx --target macos
 */
import { test } from "nsh/test";

import { shootConversation } from "./chat-shots";

test(
  "the conversation, its jump button, in light and dark",
  () => shootConversation("after"),
  180_000,
);
