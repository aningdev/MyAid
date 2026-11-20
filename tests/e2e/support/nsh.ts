// Stand-in for the NSH `nsh` module the Client's relay Carrier and Connection
// import. Every call in these tests passes its own Storage, so the default one
// must never be used; the interface language only needs a value to read.

function unused(): never {
  throw new Error("the e2e tests pass their own Storage; NSH Storage must not be used");
}

export const Storage = { getItem: unused, setItem: unused, removeItem: unused };

export function signal<T>(initial: T): (() => T) & { set(next: T): void } {
  let value = initial;
  return Object.assign(() => value, {
    set(next: T) {
      value = next;
    },
  });
}

export function locale(): string {
  return "en";
}
