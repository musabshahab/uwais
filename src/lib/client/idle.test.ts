import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserIdleDeps, createIdleStore, type IdleDeps, type IdleStore } from "./idle";
import { createSignal, globalTimers } from "./testing";

const TIMEOUT_MS = 3000;

function setup(): { store: IdleStore; activity: ReturnType<typeof createSignal> } {
  const activity = createSignal();
  const deps: IdleDeps = { timers: globalTimers, onActivity: activity.listen };
  return { store: createIdleStore(TIMEOUT_MS, () => deps), activity };
}

function watch(store: IdleStore) {
  const seen = { notifications: 0 };
  const unsubscribe = store.subscribe(() => {
    seen.notifications += 1;
  });
  return { seen, unsubscribe };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createIdleStore", () => {
  it("starts nothing when created and reports somebody present", () => {
    const { store, activity } = setup();
    expect(store.getSnapshot()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(activity.count()).toBe(0);
  });

  it("turns idle once the timeout passes without activity", () => {
    const { store } = setup();
    const { seen } = watch(store);

    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(store.getSnapshot()).toBe(false);
    vi.advanceTimersByTime(1);

    expect(store.getSnapshot()).toBe(true);
    expect(seen.notifications).toBe(1);
  });

  it("starts the wait again with every activity", () => {
    const { store, activity } = setup();
    const { seen } = watch(store);

    vi.advanceTimersByTime(TIMEOUT_MS - 100);
    activity.fire();
    vi.advanceTimersByTime(TIMEOUT_MS - 100);
    activity.fire();
    vi.advanceTimersByTime(TIMEOUT_MS - 1);

    expect(store.getSnapshot()).toBe(false);
    // Moving the mouse while the cursor is showing changes nothing, so nobody is told.
    expect(seen.notifications).toBe(0);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBe(true);
  });

  it("comes back at the first activity and turns idle again later", () => {
    const { store, activity } = setup();
    const { seen } = watch(store);
    vi.advanceTimersByTime(TIMEOUT_MS);

    activity.fire();
    expect(store.getSnapshot()).toBe(false);
    expect(seen.notifications).toBe(2);

    vi.advanceTimersByTime(TIMEOUT_MS);
    expect(store.getSnapshot()).toBe(true);
    expect(seen.notifications).toBe(3);
  });

  it("shares one timer and one listener between subscribers", () => {
    const { store, activity } = setup();
    const first = watch(store);
    const second = watch(store);
    expect(vi.getTimerCount()).toBe(1);
    expect(activity.count()).toBe(1);

    first.unsubscribe();
    vi.advanceTimersByTime(TIMEOUT_MS);

    expect(second.seen.notifications).toBe(1);
    expect(first.seen.notifications).toBe(0);
  });

  it("stops its timer and its listener with the last subscriber", () => {
    const { store, activity } = setup();
    const { seen, unsubscribe } = watch(store);
    vi.advanceTimersByTime(1000);

    unsubscribe();
    unsubscribe();

    expect(vi.getTimerCount()).toBe(0);
    expect(activity.count()).toBe(0);
    vi.advanceTimersByTime(10 * TIMEOUT_MS);
    expect(seen.notifications).toBe(0);
  });

  it("starts from somebody present again for the next subscriber", () => {
    const { store } = setup();
    const first = watch(store);
    vi.advanceTimersByTime(TIMEOUT_MS);
    expect(store.getSnapshot()).toBe(true);

    first.unsubscribe();
    expect(store.getSnapshot()).toBe(false);

    watch(store);
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(store.getSnapshot()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBe(true);
  });
});

describe("browserIdleDeps", () => {
  it("treats pointer, key, touch and wheel input as activity and removes every listener again", () => {
    const listeners = new Map<string, Set<() => void>>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void) => {
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    });
    const onActivity = vi.fn();

    const stop = browserIdleDeps().onActivity(onActivity);

    expect(Array.from(listeners.keys()).sort()).toEqual(
      ["keydown", "mousedown", "mousemove", "touchstart", "wheel"].sort(),
    );
    listeners.forEach((set) => set.forEach((listener) => listener()));
    expect(onActivity).toHaveBeenCalledTimes(5);

    stop();
    expect(Array.from(listeners.values()).every((set) => set.size === 0)).toBe(true);
  });
});
