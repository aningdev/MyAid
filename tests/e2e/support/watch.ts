// A Remote `watch` stream as a case reads it: every snapshot kept, and
// `until` resolves the moment one matches (now, or when it arrives). A stream
// that fails or ends first fails every pending `until` with the reason.

export interface Watch<T> {
  /** The newest snapshot, absent before the first. */
  readonly latest: T | undefined;
  /** Resolves with the first snapshot, from now on, that `match` accepts. */
  until(match: (snapshot: T) => boolean): Promise<T>;
  stop(): void;
}

interface Waiter<T> {
  match(snapshot: T): boolean;
  resolve(snapshot: T): void;
  reject(error: Error): void;
}

export function watching<T>(open: (signal: AbortSignal) => AsyncIterable<T>): Watch<T> {
  const controller = new AbortController();
  const waiting = new Set<Waiter<T>>();
  let latest: T | undefined;
  let closed: Error | undefined;
  const close = (error: Error): void => {
    closed = error;
    for (const waiter of waiting) waiter.reject(error);
    waiting.clear();
  };
  void (async () => {
    for await (const snapshot of open(controller.signal)) {
      latest = snapshot;
      for (const waiter of [...waiting]) {
        if (!waiter.match(snapshot)) continue;
        waiting.delete(waiter);
        waiter.resolve(snapshot);
      }
    }
    close(new Error("the watch stream ended"));
  })().catch((error: unknown) => close(error instanceof Error ? error : new Error(String(error))));
  return {
    get latest() {
      return latest;
    },
    until: (match) =>
      new Promise((resolve, reject) => {
        if (latest !== undefined && match(latest)) return resolve(latest);
        if (closed) return reject(closed);
        waiting.add({ match, resolve, reject });
      }),
    stop: () => controller.abort(),
  };
}
