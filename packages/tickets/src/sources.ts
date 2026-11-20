/**
 * The `sources` service: the seam a Source plugin registers through.
 *
 * A Source plugin owns one concrete source (a chat, a mailbox, an issue
 * tracker). It registers a kind — its identity, the config that names the
 * Owner's account there, and the Channel that writes back — together with the
 * instance this deployment uses. The plugin then delivers Triggers through
 * this service; the Tickets core decides what to do with them.
 *
 * This service holds no state of its own beyond the registrations; Triggers,
 * conversations and Tickets live in the Tickets file.
 */
import { Service } from "@deepseek-ai/cordis";
import { z } from "zod";

import { TicketError, type SourceSummary, type Trigger } from "./domain.ts";

/** One event a Source delivers; the Source's own ids win. */
export type SourceDelivery = {
  /** Stable on that Source; the same id twice is the same Trigger. */
  id: string;
  /** The Source's thread, conversation or channel. */
  thread: string;
  /** Where inside that thread a reply goes. */
  address: string;
  /** When it happened; ISO-8601 or epoch milliseconds. Defaults to now. */
  at?: string | number;
  /** The person who wrote it, when the Source can tell. */
  human?: { id: string; name?: string | null } | null;
  /** The text the person wrote. */
  text: string;
};

/** What one Channel write did: `gone` means the conversation disappeared. */
export type SourceSendResult = "sent" | "gone";

/** One message written into a Source conversation. */
export type SourceOutbound = {
  thread: string;
  address: string;
  text: string;
};

/** The write end of a Source; a Ticket's result and the Main Bot's reply use it. */
export type SourceChannel<Config> = {
  send(instance: SourceInstance<Config>, message: SourceOutbound): Promise<SourceSendResult>;
};

/** What one Source plugin registers about its kind. */
export type SourceKind<Config> = {
  /** Stable kind id, e.g. `fake`; unique across the deployment. */
  kind: string;
  /** Display names, in the product's two languages. */
  title: { zh: string; en: string };
  /** One line the Main Bot and the docs can show. */
  description: string;
  /** The deployment config of one instance. */
  config: z.ZodType<Config>;
  /** The Owner's identity (their account id) on this Source. */
  owner(config: Config): string;
  /** How this Source writes a message back into a conversation. */
  channel: SourceChannel<Config>;
};

/** One configured Source this deployment runs. */
export type SourceInstance<Config> = {
  id: string;
  enabled: boolean;
  config: Config;
};

/** A kind plus the instance this deployment runs, as one registration. */
export type SourceRegistration<Config> = {
  kind: SourceKind<Config>;
  instance: SourceInstance<Config>;
};

/** What intake decided about one delivered Trigger. */
export type TriggerDelivery = {
  status: "accepted" | "ignored" | "duplicate";
  /** The stored Trigger; absent for a duplicate. */
  trigger?: Trigger;
};

/** The Tickets side of the seam; the service delegates to it. */
export interface TriggerIntake {
  deliver(sourceId: string, trigger: SourceDelivery): Promise<TriggerDelivery>;
}

type RegisteredSource = {
  id: string;
  kind: string;
  enabled: boolean;
  title: { zh: string; en: string };
  owner: string;
  send(message: SourceOutbound): Promise<SourceSendResult>;
};

/**
 * Everything this deployment's Source plugins registered. Registrations are
 * effects: the returned function removes the kind and its instance.
 */
export class SourceRegistry {
  private readonly sources = new Map<string, RegisteredSource>();
  private readonly kinds = new Map<string, SourceKind<unknown>>();

  /** Register a kind and the instance this deployment runs. */
  register<Config>(registration: SourceRegistration<Config>): () => void {
    const { kind, instance } = registration;
    const kindId = kind.kind.trim();
    if (kindId === "") throw new Error("tickets: Source kind 不能为空。");
    if (this.kinds.has(kindId)) {
      throw new Error(`tickets: Source kind“${kindId}”已经注册过了。`);
    }
    const id = instance.id.trim();
    if (id === "") throw new Error("tickets: Source 实例 id 不能为空。");
    if (this.sources.has(id)) {
      throw new Error(`tickets: Source 实例“${id}”已经注册过了。`);
    }
    const config = kind.config.parse(instance.config);
    const owner = kind.owner(config);
    if (owner.trim() === "") {
      throw new Error(`tickets: Source“${id}”没有配置 Owner 身份。`);
    }
    this.kinds.set(kindId, kind as SourceKind<unknown>);
    this.sources.set(id, {
      id,
      kind: kindId,
      enabled: instance.enabled,
      title: kind.title,
      owner,
      send: (message) =>
        kind.channel.send({ ...instance, config } as SourceInstance<Config>, message),
    });
    return () => {
      this.sources.delete(id);
      this.kinds.delete(kindId);
    };
  }

  /** One configured instance, or null. */
  get(sourceId: string): RegisteredSource | null {
    return this.sources.get(sourceId) ?? null;
  }

  /** What the Remote shows about the registered Sources. */
  list(): SourceSummary[] {
    return [...this.sources.values()]
      .map(({ id, kind, title, owner, enabled }) => ({ id, kind, title, owner, enabled }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** Write one message back into a Source conversation. */
  async send(sourceId: string, message: SourceOutbound): Promise<SourceSendResult> {
    const source = this.sources.get(sourceId);
    if (source === undefined) {
      throw new TicketError("tickets/not-found", `Source“${sourceId}”没有注册。`);
    }
    if (!source.enabled) {
      throw new TicketError("tickets/invalid", `Source“${sourceId}”已停用。`);
    }
    return source.send(message);
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    sources: Sources;
  }
}

/**
 * The service a Source plugin injects as `ctx.sources`. Registering is an
 * effect; delivering hands the Trigger to this plugin's intake.
 */
export class Sources extends Service<never> {
  /** The registrations; also what the Tickets core reads. */
  readonly registry = new SourceRegistry();

  private intake: TriggerIntake | null = null;

  constructor(ctx: import("@deepseek-ai/cordis").Context) {
    super(ctx, "sources");
  }

  /** The Tickets plugin attaches itself once it owns the store. */
  attach(intake: TriggerIntake): void {
    this.intake = intake;
  }

  /** Register one Source kind and the instance this deployment runs. */
  register<Config>(registration: SourceRegistration<Config>): () => void {
    return this.registry.register(registration);
  }

  /** Deliver one Trigger; the result says whether it started any work. */
  deliver(sourceId: string, trigger: SourceDelivery): Promise<TriggerDelivery> {
    if (this.intake === null) {
      throw new Error("tickets: sources 服务还没有接到 Tickets。");
    }
    return this.intake.deliver(sourceId, trigger);
  }

  /** The registered Sources, without their configs. */
  list(): SourceSummary[] {
    return this.registry.list();
  }
}
