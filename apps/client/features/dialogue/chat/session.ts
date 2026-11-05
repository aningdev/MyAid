import { batch, cleanup, Clipboard, LayoutAnimation, Picker, signal } from "nsh";

import { localReply, type Provider } from "./local";
import {
  type FileRef,
  freeform,
  history,
  type Model,
  type Msg,
  retried,
  type Scenario,
  scenarios,
  type Status,
  type Tool,
} from "./scripts";

type Assistant = Extract<Msg, { kind: "assistant" }>;
type User = Extract<Msg, { kind: "user" }>;

/** Thrown into a run that was stopped. */
class Stopped extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Run {
  id: string;
  model: Model;
  script: string;
  cancelled: boolean;
  md: string;
  reason: string;
  thinkStart: number;
  thinkSeconds: number | null;
}

/**
 * Owns one Dialogue conversation: the transcript, the reply in progress, and
 * the commands that change them. The pane renders these signals and does not
 * write them.
 */
export function createChatSession(options: {
  native: boolean;
  model: () => Model;
  provider: () => Provider;
  setModel: (next: Model) => void;
  /** Pane scrolls its list and starts following it. */
  scrollToEnd: (animated: boolean) => void;
  /** After a reply settles, scroll only when the user is still pinned to the end. */
  followIfPinned: () => void;
  closeMenu: () => void;
}) {
  let ids = 0;
  const nextId = () => `m${ids++}`;

  const messages = signal<Msg[]>([]);
  const draft = signal("");
  const inputHeight = signal(20);
  const attachment = signal<{ image: string; file: FileRef } | null>(null);
  const banner = signal<"offline" | "online" | null>(null);
  const bannerKind = signal<"offline" | "online">("offline");
  const copied = signal<string | null>(null);

  const liveId = signal<string | null>(null);
  const liveReason = signal("");
  const liveThinking = signal<{ start: number; seconds: number | null } | null>(null);
  const liveTools = signal<Tool[]>([]);
  const liveMd = signal("");
  const now = signal(0);

  let cancelLocal: (() => void) | undefined;
  let run: Run | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let pendingText = "";
  let pendingReason = "";
  let frameQueued = false;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number, task: () => void) => {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      task();
    }, ms);
    pendingTimers.add(id);
  };

  const flush = () => {
    frameQueued = false;
    const current = run;
    if (!current) return;
    batch(() => {
      if (pendingReason) {
        current.reason += pendingReason;
        pendingReason = "";
        liveReason.set(current.reason);
      }
      if (pendingText) {
        current.md += pendingText;
        pendingText = "";
        liveMd.set(current.md);
      }
    });
  };
  const queue = () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(flush);
  };
  const wait = async (current: Run, ms: number) => {
    await sleep(ms);
    if (current.cancelled) throw new Stopped();
  };
  const stream = async (current: Run, text: string, rate: number, into: "text" | "reason") => {
    for (const piece of text.match(/\s*\S{1,4}|\s+/g) ?? []) {
      await wait(current, (1000 / rate) * (0.55 + Math.random() * 0.9));
      if (into === "text") pendingText += piece;
      else pendingReason += piece;
      queue();
    }
    flush();
  };
  const setTool = (id: string, change: Partial<Tool>) =>
    liveTools.set(liveTools().map((tool) => (tool.id === id ? ({ ...tool, ...change } as Tool) : tool)));
  const stopTicker = () => {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  };

  const freeze = (current: Run, status: Status, error?: string) => {
    if (run !== current) return;
    current.md += pendingText;
    current.reason += pendingReason;
    pendingText = pendingReason = "";
    stopTicker();
    const seconds =
      current.thinkSeconds ?? Math.max(1, Math.round((performance.now() - current.thinkStart) / 1000));
    const final: Assistant = {
      kind: "assistant",
      id: current.id,
      model: current.model,
      script: current.script,
      reasoning: current.reason ? { text: current.reason, seconds, open: false } : undefined,
      tools: liveTools().map((tool) =>
        tool.state === "done" ? tool : ({ ...tool, state: "cancelled" } as Tool),
      ),
      md: current.md,
      status,
      error,
    };
    run = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set(messages().map((message) => (message.id === current.id ? final : message)));
      liveId.set(null);
    });
    later(360, () => options.followIfPinned());
  };

  const reply = async (scenario: Scenario, at?: string) => {
    const current: Run = {
      id: nextId(),
      model: scenario.model,
      script: options.native ? `local:${options.provider()}` : scenario.id,
      cancelled: false,
      md: "",
      reason: "",
      thinkStart: performance.now(),
      thinkSeconds: null,
    };
    run = current;
    const placeholder: Assistant = {
      kind: "assistant",
      id: current.id,
      model: scenario.model,
      script: current.script,
      tools: [],
      md: "",
      status: "done",
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      liveReason.set("");
      liveThinking.set(null);
      liveTools.set([]);
      liveMd.set("");
      liveId.set(current.id);
      messages.set(
        at
          ? messages().map((message) => (message.id === at ? placeholder : message))
          : [...messages(), placeholder],
      );
    });
    if (options.native) {
      const all = messages();
      const conversation = all
        .slice(0, all.findIndex((message) => message.id === current.id))
        .filter(
          (message) =>
            message.kind === "user" ||
            (message.kind === "assistant" && message.id !== current.id && message.id !== at),
        );
      const prompt =
        "You are a helpful chat assistant. Answer the final user message using the conversation below. Reply directly in Markdown. Do not use tools or modify files.\n\n" +
        conversation
          .map((message) =>
            message.kind === "user"
              ? `User: ${message.text}`
              : message.kind === "assistant"
                ? `Assistant: ${message.md}`
                : "",
          )
          .join("\n\n");
      try {
        cancelLocal = localReply(
          options.provider(),
          prompt,
          (chunk) => {
            if (run !== current || current.cancelled) return;
            pendingText += chunk;
            queue();
          },
          (error) => {
            if (run !== current || current.cancelled) return;
            cancelLocal = undefined;
            freeze(current, error ? "error" : "done", error);
          },
        );
      } catch (error) {
        freeze(
          current,
          "error",
          `${options.provider()}: ${error instanceof Error ? error.message : String(error)}. Install and sign in to the CLI, then retry.`,
        );
      }
      return;
    }
    try {
      await wait(current, 450);
      for (const step of scenario.steps) {
        if ("think" in step) {
          current.thinkStart = performance.now();
          now.set(current.thinkStart);
          liveThinking.set({ start: current.thinkStart, seconds: null });
          ticker = setInterval(() => now.set(performance.now()), 1000);
          await stream(current, step.think, 75, "reason");
          stopTicker();
          current.thinkSeconds = Math.max(1, Math.round((performance.now() - current.thinkStart) / 1000));
          liveThinking.set({ start: current.thinkStart, seconds: current.thinkSeconds });
          await wait(current, 350);
        } else if ("tool" in step) {
          liveTools.set([...liveTools(), { ...step.tool, state: "pending" }]);
          await wait(current, 450);
          setTool(step.tool.id, { state: "running" });
          await wait(current, step.ms);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setTool(step.tool.id, { state: "done" });
          await wait(current, 400);
        } else if ("say" in step) {
          await stream(current, step.say, 40, "text");
        } else if ("fail" in step) {
          await wait(current, 900);
          freeze(current, "error", step.fail);
          return;
        }
      }
      freeze(current, "done");
    } catch (error) {
      if (!(error instanceof Stopped)) throw error;
    }
  };

  const stop = () => {
    if (!run) return;
    run.cancelled = true;
    cancelLocal?.();
    cancelLocal = undefined;
    freeze(run, "stopped");
  };

  const submit = async (scenario: Scenario, text: string, image?: string, file?: FileRef) => {
    if (run) return;
    options.closeMenu();
    const offline =
      !options.native &&
      (scenario.steps.find((step) => "offline" in step) as { offline: number } | undefined);
    const user: User = { kind: "user", id: nextId(), text, image, file, waiting: !!offline };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      const start: Msg[] = messages().length ? [] : [{ kind: "date", id: nextId(), label: "Today" }];
      messages.set([...messages(), ...start, user]);
      draft.set("");
      attachment.set(null);
      options.setModel(scenario.model);
    });
    options.scrollToEnd(true);
    if (offline) {
      bannerKind.set("offline");
      banner.set("offline");
      await sleep(offline.offline);
      bannerKind.set("online");
      messages.set(messages().map((message) => (message.id === user.id ? { ...user, waiting: false } : message)));
      await sleep(900);
      banner.set(null);
    }
    void reply({ ...scenario, steps: scenario.steps.filter((step) => !("offline" in step)) });
  };

  const send = () => {
    const text = draft().trim();
    const file = attachment();
    if (!text && !file) return;
    if (file) {
      const vision = scenarios.find((scenario) => scenario.id === "vision")!;
      void submit(
        { ...vision, model: options.model() === "Swift" ? "Vision" : options.model() },
        text || vision.prompt,
        file.image,
        file.file,
      );
    } else void submit(freeform(text, options.model()), text);
  };

  const choosePhoto = async () => {
    const [picked] = await Picker.pickImages({ maxDimension: 2048, quality: 0.85 });
    if (!picked) return;
    const { file } = picked;
    const size =
      file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    attachment.set({ image: URL.createObjectURL(file), file: { name: file.name, size } });
  };

  const play = (id: string) => {
    if (id === "history") {
      options.closeMenu();
      messages.set([...history(nextId), ...messages()]);
      options.scrollToEnd(false);
      return;
    }
    const scenario = scenarios.find((item) => item.id === id)!;
    void submit(scenario, scenario.prompt, scenario.image, scenario.file);
  };

  const update = (id: string, change: (message: Assistant) => Assistant) =>
    messages.set(
      messages().map((message) => (message.id === id && message.kind === "assistant" ? change(message) : message)),
    );

  const promptBefore = (id: string) => {
    const all = messages();
    for (let index = all.findIndex((message) => message.id === id) - 1; index >= 0; index--) {
      const message = all[index];
      if (message.kind === "user") return message.text;
    }
    return "";
  };

  const regenerate = (message: Assistant) => {
    if (run) return;
    options.scrollToEnd(true);
    const scenario =
      message.script === "retry"
        ? retried
        : (scenarios.find((item) => item.id === message.script) ??
          freeform(promptBefore(message.id), message.model));
    void reply(
      {
        ...scenario,
        model: message.model,
        steps: scenario.steps.filter((step) => !("offline" in step || "fail" in step)),
      },
      message.id,
    );
  };

  const retry = (message: Assistant) => {
    if (run) return;
    options.scrollToEnd(true);
    if (options.native) regenerate(message);
    else void reply(retried, message.id);
  };

  const copy = (key: string, text: string) => {
    Clipboard.writeText(text);
    copied.set(key);
    later(1600, () => copied() === key && copied.set(null));
  };

  const clearTranscript = () => {
    stop();
    batch(() => {
      messages.set([]);
      attachment.set(null);
      draft.set("");
    });
  };

  cleanup(() => {
    if (run) run.cancelled = true;
    cancelLocal?.();
    stopTicker();
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
  });

  return {
    messages,
    draft,
    inputHeight,
    attachment,
    banner,
    bannerKind,
    copied,
    liveId,
    liveReason,
    liveThinking,
    liveTools,
    liveMd,
    now,
    streaming: () => liveId() !== null,
    canSend: () => !!draft().trim() || !!attachment(),
    stop,
    send,
    choosePhoto,
    play,
    update,
    regenerate,
    retry,
    copy,
    clearTranscript,
  };
}
