/**
 * The conversation's pictures, over the fixture harness and the real
 * `Transcript`: a segment divider, a message the person sent with what it
 * carries, a reply with reasoning, tool steps, Markdown and a code block, and
 * one being written — light and dark, and scrolled up with the button that
 * comes back to the end.
 *
 * `prefix` names the side of the change the pictures belong to, since the
 * runner's sandbox passes no environment variables.
 */
import { homedir } from "os";
import { join } from "path";

import { open } from "../test/open";
import { graphical, shoot } from "./shots";

/** The pictures of the conversation's components. */
export const CHAT_SHOTS = join(homedir(), ".myaid-dev", "shots", "chat");

export async function shootConversation(prefix: string): Promise<void> {
  const app = await open("../screens/chat-shots-harness.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 900,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("text:What changed", { timeout: 30000 });
  await app.wait(400);

  // The head of the conversation: the divider, and a message with what it carries.
  await app.scroll("id:transcript", -4000);
  await app.wait(300);
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${prefix}-01-top-light.png`, CHAT_SHOTS);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${prefix}-02-top-dark.png`, CHAT_SHOTS);
  await app.setColorScheme("light");

  // Its end: steps, a reply with Markdown and a code block, and one being written.
  await app.scroll("id:transcript", 4000);
  await app.wait(300);
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${prefix}-03-conversation-light.png`, CHAT_SHOTS);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${prefix}-04-conversation-dark.png`, CHAT_SHOTS);
  await app.setColorScheme("light");

  // Scrolled up: the button that comes back to the end of the reply.
  await app.scroll("id:transcript", -900);
  await app.waitFor("label:Jump to the latest message", { timeout: 30000 });
  await app.wait(300);
  await shoot(app, `${prefix}-05-scrolled-up-light.png`, CHAT_SHOTS);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${prefix}-06-scrolled-up-dark.png`, CHAT_SHOTS);
  await app.setColorScheme("light");
}
