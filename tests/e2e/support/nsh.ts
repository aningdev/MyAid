// Stand-in for the NSH `nsh` module the relay Carrier imports. Every call in
// these tests passes its own Storage, so the default one must never be used.

function unused(): never {
  throw new Error("the e2e tests pass their own Storage; NSH Storage must not be used");
}

export const Storage = { getItem: unused, setItem: unused, removeItem: unused };
