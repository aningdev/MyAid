// An alert dialog: the system's own alert (`nsh/base`'s `AlertDialog.show`), in shadcn's parts — a
// title, a message and button labels, drawn by the platform. There is no card, no scrim and no look
// of this library to change; the app decides when it shows and what it does with the answer.
// This library's own: nothing here comes from upstream, so there is no port region. Yours to change.
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { cleanup, context, effect, signal, untracked, View } from "nsh";
import {
  AlertDialog as BaseAlertDialog,
  type AlertDialogOptions,
  type AlertDialogPresentation,
  type AlertDialogRole,
} from "nsh/base";

import { Button, type ButtonVariant } from "./button";
import { createOpenState, type OpenState } from "../../lib/open-state";

/**
 * Why an alert's open state changed: pressed open by its trigger, closed with an action chosen
 * (`onAction` has its `id`), or closed without one.
 */
export type AlertDialogChangeReason = "triggerPress" | "select" | "cancel";

/**
 * The root: it owns whether the alert is open, what was chosen, and the text its parts registered.
 * `AlertDialogContent` shows the system's alert from that; choosing an action reports its `id`
 * (`onAction`), dismissing reports `null`.
 */
export type AlertDialogProps = {
  /** Controlled; leave it out and the root keeps the state (`defaultOpen`). */
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: AlertDialogChangeReason }) => void;
  /** The chosen action `id`, or `null` when the alert closed without one. */
  onAction?: (event: { action: string | null }) => void;
};

/**
 * The alert to show: what `nsh/base`'s `AlertDialogOptions` takes besides the content, which the
 * parts register. `presentation` picks the box (`"actionSheet"` slides it up from the bottom, a
 * list on Android); Escape and a press outside close it by default as an action sheet, and not as
 * an alert — an alert waits for an action.
 *
 * The box is the platform's (UIAlertController on iOS, NSAlert on macOS, this library's drawing of
 * the same box on the web, the platform dialog on Android). It shows plain text — a title, a message
 * and button labels — never views, icons or fields, and an Android alert takes at most three buttons
 * (a fourth is dropped there). Reach for `Dialog` when the box has to hold the app's own content or
 * wear the app's look.
 */
export type AlertDialogContentProps = {
  presentation?: AlertDialogPresentation;
  closeOnEscape?: boolean | null;
  closeOnBackdropPress?: boolean | null;
  /** The parts that register what it shows: `AlertDialogTitle`, `AlertDialogAction`, … */
  children?: JSX.Element;
};

/** Opens the alert. String children render as a Button; otherwise a pressable View. */
export type AlertDialogTriggerProps = {
  children?: string | JSX.Element;
  /** The button's variant, for a string child (default `secondary`). */
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * One button of the alert. `id` is what `onAction` reports (the app's name, not the label);
 * `role` is what the button means, and the platform places and draws it by that (`cancel` on its
 * own, `destructive` in red where the platform has red).
 */
export type AlertDialogActionProps = {
  id: string;
  role?: AlertDialogRole;
  /** The button's text; the `id` when it is left out. */
  children?: string;
};

/** The cancel button: an `AlertDialogAction` with `role="cancel"` (its `id` defaults to `"cancel"`). */
export type AlertDialogCancelProps = {
  id?: string;
  children?: string;
};

/** What an action means to the platform (its `role`), from `nsh/base`. */
export type { AlertDialogRole };

/** shadcn's header block: it draws nothing, the system's box draws the title and the message. */
export type AlertDialogHeaderProps = {
  children?: JSX.Element;
};

/** shadcn's footer block: it draws nothing, and the buttons stay in the order they are given. */
export type AlertDialogFooterProps = {
  children?: JSX.Element;
};

/** The alert's title. Its string child is what the system's box shows above the message. */
export type AlertDialogTitleProps = {
  children?: string;
};

/** The alert's message, under the title. */
export type AlertDialogDescriptionProps = {
  children?: string;
};

type AlertAction = { id: string; label: string; role?: AlertDialogRole };

type AlertDialogContextValue = OpenState & {
  title: () => string | null;
  description: () => string | null;
  actions: () => AlertAction[];
  registerTitle: (text: string | null) => void;
  registerDescription: (text: string | null) => void;
  registerAction: (action: AlertAction) => void;
  forgetAction: (id: string) => void;
  /** The system's answer: report it, and close. */
  settle: (action: string | null) => void;
};

const AlertDialogContext = context<AlertDialogContextValue | null>(null);

function useAlertDialog() {
  const ctx = AlertDialogContext();
  if (!ctx) throw new Error("AlertDialog parts must be used within <AlertDialog>");
  return ctx;
}

/**
 * The box the platform is showing, if one is: `nsh/base` shows one at a time, and the answer it
 * resolves with belongs to the app, not to the part that asked for it.
 */
const onScreen = signal<string | null>(null);

/** What makes a box "the same alert": everything it shows and how it closes. */
const boxKey = (options: AlertDialogOptions) =>
  JSON.stringify([
    options.title,
    options.description,
    options.presentation,
    options.closeOnEscape,
    options.closeOnBackdropPress,
    (options.actions ?? []).map((action) => [action.id, action.label, action.role]),
  ]);

const sameAction = (a: AlertAction, b: AlertAction) =>
  a.id === b.id && a.label === b.label && a.role === b.role;

/** The root of an alert's parts: the open state, and what its parts registered to show. */
export function AlertDialog(props: AlertDialogProps) {
  const state = createOpenState<AlertDialogChangeReason>(props);
  const title = signal<string | null>(null);
  const description = signal<string | null>(null);
  const actions = signal<AlertAction[]>([]);
  return (
    <AlertDialogContext.Provider
      value={{
        ...state,
        title: () => title(),
        description: () => description(),
        actions: () => actions(),
        registerTitle: (text) => title.set(text),
        registerDescription: (text) => description.set(text),
        // In the order the parts register: a re-render of one keeps its place, and notifies
        // nothing when it says the same thing.
        registerAction: (action) => {
          actions.update((list) => {
            const at = list.findIndex((found) => found.id === action.id);
            if (at >= 0 && sameAction(list[at]!, action)) return list;
            const next = list.slice();
            if (at >= 0) next[at] = action;
            else next.push(action);
            return next;
          });
        },
        forgetAction: (id) => {
          actions.update((list) => {
            const at = list.findIndex((found) => found.id === id);
            if (at < 0) return list;
            const next = list.slice();
            next.splice(at, 1);
            return next;
          });
        },
        settle: (action) => {
          if (state.open()) state.setOpen(false, action === null ? "cancel" : "select");
          props.onAction?.({ action });
        },
      }}
    >
      {props.children}
    </AlertDialogContext.Provider>
  );
}

/** Opens the alert: a `Button` for a string child, else a pressable view. */
export function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  const ctx = useAlertDialog();
  const open = () => ctx.setOpen(true, "triggerPress");
  if (typeof props.children === "string") {
    return (
      <Button
        variant={props.variant ?? "secondary"}
        disabled={props.disabled}
        style={props.style}
        onPress={open}
      >
        {props.children}
      </Button>
    );
  }
  return (
    <View
      accessible
      role="button"
      accessibilityState={{ disabled: props.disabled }}
      onPress={props.disabled ? undefined : open}
      style={props.style}
    >
      {props.children}
    </View>
  );
}

/**
 * Shows the system's alert while the root is open, from what the parts registered, and reports
 * what it resolved with. It draws nothing itself: the platform draws the box. A box that is
 * already on screen is not shown twice — the same alert (its title, message and buttons) stays
 * one box, so a page that renders these parts again while it is open stacks nothing.
 */
export function AlertDialogContent(props: AlertDialogContentProps) {
  const ctx = useAlertDialog();
  const showing = signal(false);
  effect(() => {
    if (!ctx.open() || untracked(showing)) return;
    const options: AlertDialogOptions = {
      title: ctx.title(),
      description: ctx.description(),
      actions: ctx.actions(),
      presentation: props.presentation,
      closeOnEscape: props.closeOnEscape,
      closeOnBackdropPress: props.closeOnBackdropPress,
    };
    // A page can render these parts again with the alert already open — a stage that rebuilds its
    // children on every change does — and that part must not stack a second box on the first.
    const key = boxKey(options);
    if (untracked(onScreen) === key) return;
    const clear = () => {
      showing.set(false);
      if (untracked(onScreen) === key) onScreen.set(null);
    };
    onScreen.set(key);
    showing.set(true);
    BaseAlertDialog.show(options)
      .then(({ action }) => {
        clear();
        ctx.settle(action ?? null);
      })
      .catch(() => {
        clear();
        // `nsh/base` rejects an alert without actions only — the app's bug. Close it as a
        // dismissal rather than leave the app open on a box that never showed.
        ctx.settle(null);
      });
  });
  // The parts draw nothing; rendering them is what registers the title, the message and the
  // buttons. As the app wrote them, not in a fragment: on the web a component's fragment is
  // rendered outside its provider, and the parts would not find the root.
  return props.children ?? null;
}

/** One button of the alert: it registers its `id`, label and `role`, and draws nothing. */
export function AlertDialogAction(props: AlertDialogActionProps) {
  const ctx = useAlertDialog();
  ctx.registerAction({ id: props.id, label: props.children ?? props.id, role: props.role });
  // A part that goes away takes its button with it: the next `show` lists the ones still there.
  cleanup(() => ctx.forgetAction(props.id));
  return null;
}

/** The cancel button: `role="cancel"`, `id` `"cancel"` unless the app names another. */
export function AlertDialogCancel(props: AlertDialogCancelProps) {
  return (
    <AlertDialogAction id={props.id ?? "cancel"} role="cancel">
      {props.children}
    </AlertDialogAction>
  );
}

/** The header block of shadcn's composition: it draws nothing, and its parts keep their place. */
export function AlertDialogHeader(props: AlertDialogHeaderProps) {
  return props.children ?? null;
}

/** The footer block of shadcn's composition: it draws nothing, and the buttons keep their order. */
export function AlertDialogFooter(props: AlertDialogFooterProps) {
  return props.children ?? null;
}

/** The title the system's box shows. It draws nothing itself. */
export function AlertDialogTitle(props: AlertDialogTitleProps) {
  const ctx = useAlertDialog();
  ctx.registerTitle(props.children ?? null);
  return null;
}

/** The message the system's box shows under the title. It draws nothing itself. */
export function AlertDialogDescription(props: AlertDialogDescriptionProps) {
  const ctx = useAlertDialog();
  ctx.registerDescription(props.children ?? null);
  return null;
}
