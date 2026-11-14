import { signal, type Signal } from "nsh";

/** Controlled/uncontrolled open flag shared by composition roots. */
export type OpenState = {
  open: () => boolean;
  setOpen: (next: boolean, reason?: string) => void;
};

/** What a root's `onOpenChange` gets. */
export type OpenChangeEvent<Reason extends string = string> = {
  open: boolean;
  reason: Reason;
};

/** The open flag of a composition root: the app's `open` when it gives one, else its own. */
export function createOpenState<Reason extends string = string>(options: {
  open?: boolean | null;
  defaultOpen?: boolean;
  onOpenChange?: (event: OpenChangeEvent<Reason>) => void;
}): OpenState {
  const uncontrolled = signal(options.defaultOpen ?? false);
  return {
    open: () => (options.open != null ? Boolean(options.open) : uncontrolled()),
    setOpen: (next, reason = "triggerPress") => {
      if (options.open == null) uncontrolled.set(next);
      options.onOpenChange?.({ open: next, reason: reason as Reason });
    },
  };
}

/** Mutable slot filled by a Trigger part before Content reads it (menus, selects). */
export type Slot = {
  get: () => (() => unknown) | undefined;
  set: (accessor: () => unknown) => void;
};

export function createSlot(): Slot {
  let accessor: (() => unknown) | undefined;
  return {
    get: () => accessor,
    set: (next) => {
      accessor = next;
    },
  };
}

/** What a registered item is: the row a select or a combobox lists. */
export type RegisteredItem = {
  value: string;
  title: string;
  disabled?: boolean;
  group?: string | null;
};

/** The items a composition root's `…Item` parts register (a select's choices). */
export type ItemRegistry<T extends RegisteredItem> = {
  items: Signal<T[]>;
  register: (item: T) => void;
  unregister: (value: string) => void;
};

/**
 * Items registered by the parts under a root (the rows of a listbox). An item is kept in
 * registration order; registering the same item again notifies nothing, so a part that runs again
 * on a re-render does not loop the root.
 */
export function createItemRegistry<T extends RegisteredItem>(initial: T[] = []): ItemRegistry<T> {
  const items = signal<T[]>(initial);
  const same = (a: T, b: T) =>
    a.value === b.value && a.title === b.title && a.disabled === b.disabled && a.group === b.group;
  return {
    items,
    register: (item) => {
      items.update((list) => {
        const at = list.findIndex((found) => found.value === item.value);
        if (at >= 0 && same(list[at]!, item)) return list;
        const next = list.slice();
        if (at >= 0) next[at] = item;
        else next.push(item);
        return next;
      });
    },
    unregister: (value) => {
      items.update((list) => {
        const at = list.findIndex((found) => found.value === value);
        if (at < 0) return list;
        const next = list.slice();
        next.splice(at, 1);
        return next;
      });
    },
  };
}
