// The Connection's public Interface for code outside the app: the end-to-end
// tests drive a real dsh through it. Everything else in this directory is private.

export { Connection } from "./connection";
export { liveBots } from "./bots-live";
export { liveTickets } from "./tickets-live";
export type { BotsGateway, BotsSnapshot } from "./bots-gateway";
export type { Attention, Ticket, TicketsGateway, TicketsSnapshot } from "./tickets-gateway";
