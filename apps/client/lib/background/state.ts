import { platform, signal } from "nsh";

import { backgroundServicesRunnable } from "./protocol";
import {
  enableProductBackground,
  queryProductBackground,
  stopProductBackground,
  type ProductBackgroundView,
} from "./orchestration";

export type ProductBackgroundState = {
  runnable: boolean;
  view: ProductBackgroundView | null;
  error: string | null;
};

function isRunnableTarget(): boolean {
  return backgroundServicesRunnable(platform.os);
}

export const productBackgroundState = signal<ProductBackgroundState>({
  runnable: isRunnableTarget(),
  view: null,
  error: null,
});

let backgroundStateGeneration = 0;

function beginBackgroundStateMutation(): number {
  backgroundStateGeneration += 1;
  return backgroundStateGeneration;
}

function applyBackgroundStateIfCurrent(
  generation: number,
  next: ProductBackgroundState,
): ProductBackgroundState {
  if (generation !== backgroundStateGeneration) {
    return productBackgroundState();
  }
  productBackgroundState.set(next);
  return next;
}

/** Tests reset generation so stale-write cases stay deterministic. */
export function resetProductBackgroundStateForTests(): void {
  backgroundStateGeneration = 0;
  productBackgroundState.set({
    runnable: isRunnableTarget(),
    view: null,
    error: null,
  });
}

export async function refreshProductBackgroundState(): Promise<ProductBackgroundState> {
  const generation = beginBackgroundStateMutation();
  const runnable = isRunnableTarget();
  if (!runnable) {
    return applyBackgroundStateIfCurrent(generation, {
      runnable: false,
      view: null,
      error: null,
    });
  }
  try {
    const view = await queryProductBackground();
    return applyBackgroundStateIfCurrent(generation, { runnable: true, view, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return applyBackgroundStateIfCurrent(generation, {
      runnable: true,
      view: null,
      error: message,
    });
  }
}

export async function loadProductBackgroundState(): Promise<ProductBackgroundState> {
  return refreshProductBackgroundState();
}

export async function enableBackgroundFromState(): Promise<ProductBackgroundState> {
  const generation = beginBackgroundStateMutation();
  if (!isRunnableTarget()) {
    return productBackgroundState();
  }
  try {
    const view = await enableProductBackground();
    return applyBackgroundStateIfCurrent(generation, { runnable: true, view, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (generation !== backgroundStateGeneration) {
      return productBackgroundState();
    }
    const next: ProductBackgroundState = {
      ...productBackgroundState(),
      error: message,
    };
    productBackgroundState.set(next);
    return next;
  }
}

export async function stopBackgroundFromState(): Promise<ProductBackgroundState> {
  const generation = beginBackgroundStateMutation();
  if (!isRunnableTarget()) {
    return productBackgroundState();
  }
  try {
    const view = await stopProductBackground();
    return applyBackgroundStateIfCurrent(generation, { runnable: true, view, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (generation !== backgroundStateGeneration) {
      return productBackgroundState();
    }
    const next: ProductBackgroundState = {
      ...productBackgroundState(),
      error: message,
    };
    productBackgroundState.set(next);
    return next;
  }
}
