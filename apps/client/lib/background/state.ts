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

export async function refreshProductBackgroundState(): Promise<ProductBackgroundState> {
  const runnable = isRunnableTarget();
  if (!runnable) {
    const next: ProductBackgroundState = { runnable: false, view: null, error: null };
    productBackgroundState.set(next);
    return next;
  }
  try {
    const view = await queryProductBackground();
    const next: ProductBackgroundState = { runnable: true, view, error: null };
    productBackgroundState.set(next);
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const next: ProductBackgroundState = {
      runnable: true,
      view: null,
      error: message,
    };
    productBackgroundState.set(next);
    return next;
  }
}

export async function loadProductBackgroundState(): Promise<ProductBackgroundState> {
  return refreshProductBackgroundState();
}

export async function enableBackgroundFromState(): Promise<ProductBackgroundState> {
  if (!isRunnableTarget()) {
    return productBackgroundState();
  }
  try {
    const view = await enableProductBackground();
    const next: ProductBackgroundState = { runnable: true, view, error: null };
    productBackgroundState.set(next);
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const next: ProductBackgroundState = {
      ...productBackgroundState(),
      error: message,
    };
    productBackgroundState.set(next);
    return next;
  }
}

export async function stopBackgroundFromState(): Promise<ProductBackgroundState> {
  if (!isRunnableTarget()) {
    return productBackgroundState();
  }
  try {
    const view = await stopProductBackground();
    const next: ProductBackgroundState = { runnable: true, view, error: null };
    productBackgroundState.set(next);
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const next: ProductBackgroundState = {
      ...productBackgroundState(),
      error: message,
    };
    productBackgroundState.set(next);
    return next;
  }
}
