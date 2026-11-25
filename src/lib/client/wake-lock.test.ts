import { describe, expect, it } from "vitest";
import { createSignal } from "./testing";
import {
  createWakeLock,
  type WakeLockDeps,
  type WakeLockSentinelLike,
  type WakeLockStore,
} from "./wake-lock";

/** A wake lock as the browser hands it out. */
class FakeSentinel implements WakeLockSentinelLike {
  released = false;
  releaseCalls = 0;
  private readonly listeners: Array<() => void> = [];

  release(): Promise<void> {
    this.releaseCalls += 1;
    if (this.released) return Promise.reject(new Error("InvalidStateError"));
    this.drop();
    return Promise.resolve();
  }

  addEventListener(_type: "release", listener: () => void): void {
    this.listeners.push(listener);
  }

  /** What the browser does when the page is hidden: the lock is gone and says so. */
  drop(): void {
    this.released = true;
    this.listeners.forEach((listener) => listener());
  }
}

/** A simulated browser. */
interface World {
  visible: boolean;
  /** Whether the browser grants a request. */
  grant: boolean;
  /** When true a request stays unanswered until `answer` is called. */
  hold: boolean;
  /** Answers the held requests. */
  answer(): void;
  requests: number;
  sentinels: FakeSentinel[];
  wake: ReturnType<typeof createSignal>;
  deps: WakeLockDeps;
}

function createWorld(options: { supported?: boolean } = {}): World {
  const held: Array<() => void> = [];
  const world: World = {
    visible: true,
    grant: true,
    hold: false,
    answer: () => held.splice(0).forEach((resolve) => resolve()),
    requests: 0,
    sentinels: [],
    wake: createSignal(),
    deps: undefined as unknown as WakeLockDeps,
  };
  const request = (): Promise<WakeLockSentinelLike> => {
    world.requests += 1;
    const settle = (): Promise<WakeLockSentinelLike> => {
      if (!world.grant) return Promise.reject(new Error("NotAllowedError"));
      const sentinel = new FakeSentinel();
      world.sentinels.push(sentinel);
      return Promise.resolve(sentinel);
    };
    if (!world.hold) return settle();
    return new Promise<void>((resolve) => held.push(resolve)).then(settle);
  };
  world.deps = {
    request: options.supported === false ? null : request,
    isVisible: () => world.visible,
    onWake: world.wake.listen,
  };
  return world;
}

function watch(store: WakeLockStore) {
  const seen = { notifications: 0 };
  const unsubscribe = store.subscribe(() => {
    seen.notifications += 1;
  });
  return { seen, unsubscribe };
}

/** Lets every pending promise callback run. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createWakeLock", () => {
  it("requests nothing when created", () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    expect(store.getSnapshot()).toBe(false);
    expect(world.requests).toBe(0);
    expect(world.wake.count()).toBe(0);
  });

  it("requests the lock for its first subscriber and reports it once granted", async () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    const { seen } = watch(store);
    expect(store.getSnapshot()).toBe(false);

    await settled();

    expect(world.requests).toBe(1);
    expect(store.getSnapshot()).toBe(true);
    expect(seen.notifications).toBe(1);
  });

  it("does nothing, quietly, where the browser has no Wake Lock API", async () => {
    const world = createWorld({ supported: false });
    const store = createWakeLock(() => world.deps);
    const { seen } = watch(store);

    world.wake.fire();
    await settled();

    expect(store.getSnapshot()).toBe(false);
    expect(seen.notifications).toBe(0);
  });

  it("carries on when the browser refuses, and asks again when the page comes back", async () => {
    const world = createWorld();
    world.grant = false;
    const store = createWakeLock(() => world.deps);
    const { seen } = watch(store);
    await settled();
    expect(store.getSnapshot()).toBe(false);
    expect(seen.notifications).toBe(0);

    world.grant = true;
    world.wake.fire();
    await settled();

    expect(world.requests).toBe(2);
    expect(store.getSnapshot()).toBe(true);
  });

  it("does not ask while the page is hidden; asks when it comes on screen", async () => {
    const world = createWorld();
    world.visible = false;
    const store = createWakeLock(() => world.deps);
    watch(store);
    await settled();
    expect(world.requests).toBe(0);

    world.visible = true;
    world.wake.fire();
    await settled();

    expect(world.requests).toBe(1);
    expect(store.getSnapshot()).toBe(true);
  });

  it("notices when the browser drops the lock and takes it again when the page comes back", async () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    const { seen } = watch(store);
    await settled();

    world.sentinels[0].drop();
    expect(store.getSnapshot()).toBe(false);
    expect(seen.notifications).toBe(2);

    world.wake.fire();
    await settled();

    expect(world.requests).toBe(2);
    expect(store.getSnapshot()).toBe(true);
    expect(seen.notifications).toBe(3);
  });

  it("asks once when several wake-ups arrive together, and not at all while it holds the lock", async () => {
    const world = createWorld();
    world.visible = false;
    const store = createWakeLock(() => world.deps);
    watch(store);
    world.visible = true;

    // `visibilitychange` and `pageshow` fire back to back.
    world.wake.fire();
    world.wake.fire();
    await settled();
    expect(world.requests).toBe(1);

    world.wake.fire();
    await settled();
    expect(world.requests).toBe(1);
  });

  it("releases the lock and stops listening with its last subscriber", async () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    const first = watch(store);
    const second = watch(store);
    await settled();

    first.unsubscribe();
    expect(world.sentinels[0].released).toBe(false);
    second.unsubscribe();

    expect(world.sentinels[0].released).toBe(true);
    expect(store.getSnapshot()).toBe(false);
    expect(world.wake.count()).toBe(0);
    // The component that asked for the release is gone; nobody is told.
    expect(second.seen.notifications).toBe(1);
  });

  it("gives back a lock that is granted after it stopped", async () => {
    const world = createWorld();
    world.hold = true;
    const store = createWakeLock(() => world.deps);
    const { seen, unsubscribe } = watch(store);
    await settled();

    unsubscribe();
    world.answer();
    await settled();

    expect(world.sentinels).toHaveLength(1);
    expect(world.sentinels[0].released).toBe(true);
    expect(store.getSnapshot()).toBe(false);
    expect(seen.notifications).toBe(0);
  });

  it("is not confused by a late answer from before a restart", async () => {
    const world = createWorld();
    world.hold = true;
    const store = createWakeLock(() => world.deps);
    watch(store).unsubscribe();

    // Subscribed again before the first request is answered.
    watch(store);
    world.answer();
    await settled();

    expect(world.requests).toBe(2);
    expect(world.sentinels).toHaveLength(2);
    expect(world.sentinels.filter((sentinel) => !sentinel.released)).toHaveLength(1);
    expect(store.getSnapshot()).toBe(true);
  });

  it("does not mind a release that fails", async () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    const { unsubscribe } = watch(store);
    await settled();
    // The browser dropped the lock without telling: releasing it again rejects.
    world.sentinels[0].released = true;

    unsubscribe();
    await settled();

    expect(world.sentinels[0].releaseCalls).toBe(1);
    expect(store.getSnapshot()).toBe(false);
  });

  it("takes the lock again for the next subscriber", async () => {
    const world = createWorld();
    const store = createWakeLock(() => world.deps);
    watch(store).unsubscribe();
    await settled();

    watch(store);
    await settled();

    expect(store.getSnapshot()).toBe(true);
    expect(world.wake.count()).toBe(1);
  });
});
