// Stand-in for the NSH `nsh` module the Client's i18n imports; the interface
// language only needs a value to read. The Devices keep their records in files,
// so there is no Storage here to reach.

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
