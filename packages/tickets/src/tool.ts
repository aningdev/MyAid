/**
 * The one tool the Main Bot gets: hand work to a Bot as a Ticket.
 *
 * The tool is registered on the Main Bot's Agent only, and lists the Bots it
 * may hand to at registration time, so the model never invents a colper.
 */
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { BotsRouting } from "dsh-bots";
import { z } from "zod";

import type { TicketsCore } from "./core.ts";

export const OPEN_TICKET_TOOL = "ticket_open";

/** Arguments the model passes; the description carries the routing rules. */
export const openTicketToolInput = z.object({
  bot: z.string().min(1).describe("目标 Bot 的名字或 id，必须是列出的可用 Bot 之一。"),
  title: z.string().min(1).describe("一句话说明这件工作，作为 Ticket 的标题。"),
  task: z.string().min(1).describe("交给 Bot 的完整请求，原样放进它的 Session。"),
  workspacePath: z
    .string()
    .min(1)
    .optional()
    .describe("可选的工作目录绝对路径；省略时用 Bot 的默认目录。"),
});
export type OpenTicketToolInput = z.infer<typeof openTicketToolInput>;

export function openTicketTool(
  core: TicketsCore,
  agent: Agent,
  routing: BotsRouting,
): ToolDefinition {
  const roster = routing.bots.map((bot) => bot.name).join("、");
  return {
    name: OPEN_TICKET_TOOL,
    description:
      "把一件工作开成 Ticket 交给一个 Bot。对方会在自己的 Session 里、用它自己的 Agent preset 独立执行，" +
      "你可以继续别的事；它结束时结果会回到这条对话，需要 Owner 决定时会变成 Attention。" +
      `可用的 Bot：${roster}。`,
    parameters: z.toJSONSchema(openTicketToolInput),
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args) {
      const input = openTicketToolInput.parse(args);
      const ticket = await core.open({
        bot: input.bot,
        title: input.title,
        request: input.task,
        ...(input.workspacePath === undefined ? {} : { workspacePath: input.workspacePath }),
        origin: { kind: "main-bot", sessionId: String(agent.id) },
      });
      const target = routing.bots.find((candidate) => candidate.id === ticket.botId);
      return {
        ticketId: ticket.id,
        sessionId: ticket.sessionId,
        bot: target?.name ?? ticket.botId,
        botId: ticket.botId,
        status: ticket.status,
      };
    },
  };
}
