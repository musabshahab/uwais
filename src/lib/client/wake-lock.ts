/**
 * Keeps the screen awake while the TV page is shown, using the Screen Wake
 * Lock API where the browser has it. The browser drops the lock whenever the
 * page is hidden, so it is requested again each time the page comes back.
 * Where the API is missing (Chromium before 84) or the request is refused
 * (battery saver), nothing happens and nothing is reported: such a screen
 * relies on the device's own "never sleep" setting.
 */

import { isDocumentVisible, onPageWake } from "./browser";

/** The part of a `WakeLockSentinel` this module uses. */
export interface WakeLockSentinelLike {
  release(): Promise<unknown>;
  addEventListener(type: "release", listener: () => void): void;
}

/** What the wake lock needs from its environment. */
export interface WakeLockDeps {
  /** Requests a screen wake lock; null where the browser has no Wake Lock API. */
  request: (() => Promise<WakeLockSentinelLike>) | null;
  /** Whether the page is on screen; a lock can only be requested then. */
  isVisible(): boolean;
  /** Subscribes to "the page is in front of the viewer again"; returns the unsubscribe function. */
  onWake(listener: () => void): () => void;
}

/**
 * The wake lock as an external store, readable by React with
 * `useSyncExternalStore`. It holds the lock while it has at least one
 * subscriber.
 */
export interface WakeLockStore {
  /** Subscribes to changes of the lock; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Whether the screen is being kept awake right now. */
  getSnapshot(): boolean;
}

/** The dependencies of {@link createWakeLock} in a browser. */
export function browserWakeLockDeps(): WakeLockDeps {
  const api = "wakeLock" in navigator ? navigator.wakeLock : null;
  return {
    request: api ? () => api.request("screen") : null,
    isVisible: isDocumentVisible,
    onWake: onPageWake,
  };
}

/**
 * Creates the wake lock. Creating it has no side effects; it requests the
 * lock with its first subscriber, re-requests it whenever the page comes back
 * on screen, and releases it with its last subscriber.
 * @param resolveDeps Supplies the environment at start; replaceable in tests.
 */
export function createWakeLock(resolveDeps: () => WakeLockDeps = browserWakeLockDeps): WakeLockStore {
  const listeners = new Set<() => void>();
  let deps: WakeLockDeps | null = null;
  let running = false;
  /** Bumped on every stop, so a request answered after it can recognise itself as stale. */
  let run = 0;
  let requesting = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let unlisten: (() => void) | null = null;

  function emit(): void {
    listeners.forEach((listener) => listener());
  }

  function release(lock: WakeLockSentinelLike): void {
    // Releasing a lock the browser already dropped rejects; either way it is gone.
    lock.release().catch(() => undefined);
  }

  async function acquire(): Promise<void> {
    const env = deps;
    if (!running || env === null || env.request === null) return;
    if (requesting || sentinel !== null || !env.isVisible()) return;
    requesting = true;
    const startedInRun = run;
    let lock: WakeLockSentinelLike;
    try {
      lock = await env.request();
    } catch {
      // Refused (battery saver, policy, page hidden meanwhile). The next wake tries again.
      if (startedInRun === run) requesting = false;
      return;
    }
    if (startedInRun !== run) {
      release(lock);
      return;
    }
    requesting = false;
    sentinel = lock;
    lock.addEventListener("release", () => {
      if (sentinel !== lock) return;
      sentinel = null;
      emit();
    });
    emit();
  }

  function start(): void {
    const env = resolveDeps();
    deps = env;
    running = true;
    unlisten = env.onWake(() => void acquire());
    void acquire();
  }

  function stop(): void {
    running = false;
    run += 1;
    requesting = false;
    if (unlisten !== null) unlisten();
    unlisten = null;
    if (sentinel !== null) {
      const lock = sentinel;
      sentinel = null;
      release(lock);
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (listeners.delete(listener) && listeners.size === 0) stop();
      };
    },
    getSnapshot: () => sentinel !== null,
  };
}
