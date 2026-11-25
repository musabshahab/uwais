/**
 * Notices when nobody is using the pointer or the keyboard. The TV page uses
 * it to hide the mouse cursor and its on-screen controls a few seconds after
 * the last movement, and to bring them back when somebody picks up the remote.
 */

import { browserTimers, onWindowEvent } from "./browser";
import type { TimerHandle, Timers } from "./http";

/** Input events that count as "somebody is here". */
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/** What the idle store needs from its environment. */
export interface IdleDeps {
  timers: Timers;
  /** Subscribes to any pointer or keyboard activity; returns the unsubscribe function. */
  onActivity(listener: () => void): () => void;
}

/** Idleness as an external store, readable by React with `useSyncExternalStore`. */
export interface IdleStore {
  /** Subscribes to changes between idle and active; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Whether there has been no activity for the configured time. */
  getSnapshot(): boolean;
}

/** The dependencies of {@link createIdleStore} in a browser. */
export function browserIdleDeps(): IdleDeps {
  return {
    timers: browserTimers,
    onActivity(listener) {
      const stops = ACTIVITY_EVENTS.map((type) => onWindowEvent(type, listener));
      return () => stops.forEach((stop) => stop());
    },
  };
}

/**
 * Creates an idle store: active when it gains its first subscriber, idle once
 * `timeoutMs` pass without activity, and active again on the next activity.
 * @param resolveDeps Supplies the environment at start; replaceable in tests.
 */
export function createIdleStore(
  timeoutMs: number,
  resolveDeps: () => IdleDeps = browserIdleDeps,
): IdleStore {
  const listeners = new Set<() => void>();
  let deps: IdleDeps | null = null;
  let idle = false;
  let timer: TimerHandle = null;
  let unlisten: (() => void) | null = null;

  function setIdle(next: boolean): void {
    if (idle === next) return;
    idle = next;
    listeners.forEach((listener) => listener());
  }

  function restart(env: IdleDeps): void {
    env.timers.clearTimeout(timer);
    timer = env.timers.setTimeout(() => setIdle(true), timeoutMs);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const env = resolveDeps();
        deps = env;
        unlisten = env.onActivity(() => {
          setIdle(false);
          restart(env);
        });
        restart(env);
      }
      return () => {
        if (!listeners.delete(listener) || listeners.size > 0) return;
        if (deps !== null) deps.timers.clearTimeout(timer);
        if (unlisten !== null) unlisten();
        unlisten = null;
        // Nobody is watching: the next subscriber starts from "somebody is here".
        idle = false;
      };
    },
    getSnapshot: () => idle,
  };
}
