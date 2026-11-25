import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayPayload } from "@/lib/types";
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DISPLAY_ENDPOINT,
  HIDDEN_POLL_INTERVAL_MS,
  MAX_STORED_CHARS,
  ONLINE_THROTTLE_MS,
  POLL_INTERVAL_MS,
  POLL_JITTER,
  REQUEST_TIMEOUT_MS,
  STORAGE_KEY,
  STORAGE_VERSION,
  WAKE_THROTTLE_MS,
  createDisplayStore,
  fetchDisplayPayload,
  isDisplayPayload,
  newerPayload,
  pollDelayMs,
  readStoredPayload,
  reconcilePayload,
  statusAfter,
  writeStoredPayload,
  type DisplayStore,
  type DisplayStoreDeps,
} from "./display-data";
import type { FetchLike, ResponseLike } from "./http";
import {
  MemoryStorage,
  SAMPLE_NOW_MS,
  createSignal,
  globalTimers,
  htmlResponse,
  jsonResponse,
  makeDay,
  makePayload,
} from "./testing";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A payload as it looks after travelling over the network: plain JSON, no shared objects. */
function overTheWire(payload: DisplayPayload): DisplayPayload {
  return JSON.parse(JSON.stringify(payload)) as DisplayPayload;
}

/** A copy of a valid payload with one thing changed, typed loosely on purpose. */
function tampered(change: (payload: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(makePayload())) as Record<string, unknown>;
  change(copy);
  return copy;
}

function storedRecord(payload: DisplayPayload): string {
  return JSON.stringify({ v: STORAGE_VERSION, payload });
}

describe("isDisplayPayload", () => {
  it("accepts a payload, also after a trip through JSON", () => {
    expect(isDisplayPayload(makePayload())).toBe(true);
    expect(isDisplayPayload(overTheWire(makePayload()))).toBe(true);
  });

  it("accepts a day on which some times are not published", () => {
    const payload = makePayload({
      days: [makeDay("2026-11-25", { sunrise: null, fajrBegins: null, jumuah: ["13:15", "14:00"] })],
    });
    expect(isDisplayPayload(payload)).toBe(true);
  });

  it("accepts an empty timetable and announcements with and without dates", () => {
    const payload = makePayload({
      days: [],
      coverage: { firstDate: null, lastDate: null, totalDays: 0 },
      announcements: [
        {
          id: 7,
          title: "Car park",
          body: "Closed on Saturday.",
          startsOn: "2026-11-26",
          endsOn: null,
          showOnSite: true,
          showOnTv: false,
          pinned: false,
          createdAt: "2026-11-20T10:00:00.000Z",
          updatedAt: "2026-11-20T10:00:00.000Z",
        },
      ],
    });
    expect(isDisplayPayload(payload)).toBe(true);
  });

  it("allows fields it does not know, so an old page works against a newer server", () => {
    const value = tampered((payload) => {
      payload.somethingNew = { enabled: true };
      (payload.settings as Record<string, unknown>).accentColour = "#0a7";
    });
    expect(isDisplayPayload(value)).toBe(true);
  });

  it("rejects what a captive portal or a broken proxy sends instead of JSON data", () => {
    for (const value of [null, undefined, "<!doctype html><html></html>", 42, true, [], [makePayload()], {}]) {
      expect(isDisplayPayload(value)).toBe(false);
    }
  });

  it("rejects a payload with any top-level field missing", () => {
    for (const key of Object.keys(makePayload())) {
      expect(isDisplayPayload(tampered((payload) => delete payload[key]))).toBe(false);
    }
  });

  it("rejects a server clock that is not a positive finite number", () => {
    for (const serverNow of ["1795608000000", null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isDisplayPayload({ ...makePayload(), serverNow })).toBe(false);
    }
  });

  it("rejects an empty or non-text build id", () => {
    expect(isDisplayPayload({ ...makePayload(), version: "" })).toBe(false);
    expect(isDisplayPayload({ ...makePayload(), version: 3 })).toBe(false);
  });

  it("rejects malformed timetable rows", () => {
    const withDay = (day: unknown) => tampered((payload) => (payload.days as unknown[]).push(day));
    const good = makeDay("2026-11-28");
    expect(isDisplayPayload(withDay(good))).toBe(true);
    expect(isDisplayPayload(withDay({ ...good, date: "2026-02-30" }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, date: "28/11/2026" }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, asrJamaat: 1430 }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, asrJamaat: undefined }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, jumuah: "13:15" }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, jumuah: [1315] }))).toBe(false);
    expect(isDisplayPayload(withDay({ ...good, note: 5 }))).toBe(false);
    expect(isDisplayPayload(withDay(null))).toBe(false);
    expect(isDisplayPayload(withDay("2026-11-28"))).toBe(false);
  });

  it("rejects settings the display could not render with", () => {
    const withSettings = (change: (settings: Record<string, unknown>) => void) =>
      tampered((payload) => change(payload.settings as Record<string, unknown>));
    expect(isDisplayPayload(withSettings((settings) => (settings.timezone = "")))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => delete settings.timezone))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => (settings.timeFormat = "12")))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => (settings.hijriAdjustment = "1")))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => (settings.hijriRollAtMaghrib = 1)))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => (settings.jumuah = [{ label: "Jumu'ah" }])))).toBe(false);
    expect(isDisplayPayload(withSettings((settings) => delete settings.tv))).toBe(false);
    expect(
      isDisplayPayload(withSettings((settings) => ((settings.tv as Record<string, unknown>).theme = "dusk"))),
    ).toBe(false);
    expect(
      isDisplayPayload(
        withSettings((settings) => ((settings.tv as Record<string, unknown>).announcementSeconds = null)),
      ),
    ).toBe(false);
  });

  it("rejects malformed announcements and coverage", () => {
    const announcement = {
      id: 1,
      title: "Eid prayer",
      body: "",
      startsOn: null,
      endsOn: null,
      showOnSite: true,
      showOnTv: true,
      pinned: true,
      createdAt: "2026-11-20T10:00:00.000Z",
      updatedAt: "2026-11-20T10:00:00.000Z",
    };
    expect(isDisplayPayload({ ...makePayload(), announcements: [announcement] })).toBe(true);
    expect(isDisplayPayload({ ...makePayload(), announcements: [{ ...announcement, id: "1" }] })).toBe(false);
    expect(isDisplayPayload({ ...makePayload(), announcements: [{ ...announcement, pinned: "yes" }] })).toBe(
      false,
    );
    expect(isDisplayPayload({ ...makePayload(), announcements: { 0: announcement } })).toBe(false);
    expect(isDisplayPayload({ ...makePayload(), coverage: { firstDate: null, lastDate: null } })).toBe(false);
    expect(isDisplayPayload({ ...makePayload(), coverage: null })).toBe(false);
  });

  it("rejects lists of unbelievable length", () => {
    const days = Array.from({ length: 1001 }, () => makeDay("2026-11-25"));
    expect(isDisplayPayload(makePayload({ days }))).toBe(false);
    expect(isDisplayPayload(makePayload({ days: days.slice(0, 1000) }))).toBe(true);
  });
});

describe("newerPayload", () => {
  const initial = makePayload({ serverNow: 5000 });

  it("keeps the page's payload when storage has nothing", () => {
    expect(newerPayload(initial, null)).toBe(initial);
  });

  it("prefers the stored payload only when the server produced it later", () => {
    const newer = makePayload({ serverNow: 5001 });
    const same = makePayload({ serverNow: 5000 });
    const older = makePayload({ serverNow: 4999 });
    expect(newerPayload(initial, newer)).toBe(newer);
    expect(newerPayload(initial, same)).toBe(initial);
    expect(newerPayload(initial, older)).toBe(initial);
  });
});

describe("reconcilePayload", () => {
  it("keeps the previous objects for every part whose content did not change", () => {
    const previous = makePayload({ serverNow: 1000 });
    const next = overTheWire(makePayload({ serverNow: 2000, version: "build-2" }));

    const result = reconcilePayload(previous, next);

    expect(result.serverNow).toBe(2000);
    expect(result.version).toBe("build-2");
    expect(result.settings).toBe(previous.settings);
    expect(result.days).toBe(previous.days);
    expect(result.announcements).toBe(previous.announcements);
    expect(result.coverage).toBe(previous.coverage);
  });

  it("takes the new object for exactly the parts that changed", () => {
    const previous = makePayload({ serverNow: 1000 });
    const next = overTheWire(
      makePayload({ serverNow: 2000, days: [makeDay("2026-11-25", { ishaJamaat: "19:45" })] }),
    );

    const result = reconcilePayload(previous, next);

    expect(result.days).toBe(next.days);
    expect(result.days[0].ishaJamaat).toBe("19:45");
    expect(result.settings).toBe(previous.settings);
    expect(result.coverage).toBe(previous.coverage);
  });

  it("does not modify either argument", () => {
    const previous = makePayload({ serverNow: 1000 });
    const next = makePayload({ serverNow: 2000 });
    const before = JSON.stringify([previous, next]);
    reconcilePayload(previous, next);
    expect(JSON.stringify([previous, next])).toBe(before);
  });
});

describe("readStoredPayload", () => {
  it("returns null without storage or without an entry", () => {
    expect(readStoredPayload(null)).toBeNull();
    expect(readStoredPayload(new MemoryStorage())).toBeNull();
  });

  it("returns the payload that was written", () => {
    const storage = new MemoryStorage();
    const payload = makePayload();
    expect(writeStoredPayload(storage, payload)).toBe(true);
    expect(readStoredPayload(storage)).toEqual(payload);
  });

  it("returns null when storage refuses to be read", () => {
    const storage = new MemoryStorage();
    writeStoredPayload(storage, makePayload());
    storage.failReads = true;
    expect(readStoredPayload(storage)).toBeNull();
  });

  it("discards an entry that is not JSON", () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, "{not json");
    expect(readStoredPayload(storage)).toBeNull();
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
  });

  it("discards an entry of another format version", () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION + 1, payload: makePayload() }));
    expect(readStoredPayload(storage)).toBeNull();
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
  });

  it("discards an entry whose payload is not valid", () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, payload: { version: "x" } }));
    expect(readStoredPayload(storage)).toBeNull();
    expect(storage.items.has(STORAGE_KEY)).toBe(false);

    for (const raw of ["null", "[]", '"text"', "12"]) {
      storage.items.set(STORAGE_KEY, raw);
      expect(readStoredPayload(storage)).toBeNull();
    }
  });

  it("discards an oversized entry", () => {
    const storage = new MemoryStorage();
    const padded = makePayload({ version: "x".repeat(MAX_STORED_CHARS) });
    storage.items.set(STORAGE_KEY, storedRecord(padded));
    expect(readStoredPayload(storage)).toBeNull();
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
  });

  it("does not throw when a bad entry cannot be removed either", () => {
    const storage = new MemoryStorage();
    storage.items.set(STORAGE_KEY, "garbage");
    storage.failWrites = true;
    expect(readStoredPayload(storage)).toBeNull();
  });
});

describe("writeStoredPayload", () => {
  it("writes a versioned record under the versioned key", () => {
    const storage = new MemoryStorage();
    const payload = makePayload();
    expect(writeStoredPayload(storage, payload)).toBe(true);
    expect(JSON.parse(storage.items.get(STORAGE_KEY) ?? "")).toEqual({ v: STORAGE_VERSION, payload });
  });

  it("reports failure without storage", () => {
    expect(writeStoredPayload(null, makePayload())).toBe(false);
  });

  it("survives a full or blocked storage and leaves the previous entry in place", () => {
    const storage = new MemoryStorage();
    const first = makePayload({ serverNow: 1000 });
    writeStoredPayload(storage, first);
    storage.failWrites = true;

    expect(writeStoredPayload(storage, makePayload({ serverNow: 2000 }))).toBe(false);

    storage.failWrites = false;
    expect(readStoredPayload(storage)).toEqual(first);
  });

  it("refuses a record larger than the cap", () => {
    const storage = new MemoryStorage();
    const huge = makePayload({ version: "x".repeat(MAX_STORED_CHARS) });
    expect(writeStoredPayload(storage, huge)).toBe(false);
    expect(storage.items.size).toBe(0);
  });
});

describe("pollDelayMs", () => {
  it("is the poll interval after a success", () => {
    expect(pollDelayMs(0, true, 0.5)).toBe(POLL_INTERVAL_MS);
  });

  it("spreads every delay by the jitter, either way", () => {
    expect(pollDelayMs(0, true, 0)).toBe(POLL_INTERVAL_MS * (1 - POLL_JITTER));
    expect(pollDelayMs(0, true, 0.99)).toBeLessThan(POLL_INTERVAL_MS * (1 + POLL_JITTER));
    expect(pollDelayMs(0, true, 0.99)).toBeGreaterThan(POLL_INTERVAL_MS * 1.09);
    expect(pollDelayMs(1, true, 0)).toBe(BACKOFF_BASE_MS * (1 - POLL_JITTER));
  });

  it("backs off exponentially from the base to the maximum while failing", () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8].map((failures) => pollDelayMs(failures, true, 0.5));
    expect(delays).toEqual([
      5 * SECOND,
      10 * SECOND,
      20 * SECOND,
      40 * SECOND,
      80 * SECOND,
      160 * SECOND,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ]);
  });

  it("stays at the maximum however long the outage lasts", () => {
    expect(pollDelayMs(10_000, true, 0.5)).toBe(BACKOFF_MAX_MS);
    expect(pollDelayMs(Number.MAX_SAFE_INTEGER, true, 0.5)).toBe(BACKOFF_MAX_MS);
  });

  it("uses the slow interval for a hidden page, failing or not", () => {
    expect(pollDelayMs(0, false, 0.5)).toBe(HIDDEN_POLL_INTERVAL_MS);
    expect(pollDelayMs(3, false, 0.5)).toBe(HIDDEN_POLL_INTERVAL_MS);
  });
});

describe("statusAfter", () => {
  it("is live after a live answer, whatever the browser believes about the network", () => {
    expect(statusAfter("live", true)).toBe("live");
    expect(statusAfter("live", false)).toBe("live");
  });

  it("is offline after a network failure", () => {
    expect(statusAfter("network-error", true)).toBe("offline");
    expect(statusAfter("network-error", false)).toBe("offline");
  });

  it("is stale after a cached or unusable answer while the device has a network", () => {
    expect(statusAfter("cached", true)).toBe("stale");
    expect(statusAfter("bad-response", true)).toBe("stale");
  });

  it("is offline after a cached or unusable answer while the device has no network", () => {
    expect(statusAfter("cached", false)).toBe("offline");
    expect(statusAfter("bad-response", false)).toBe("offline");
  });
});

describe("fetchDisplayPayload", () => {
  const depsWith = (fetch: FetchLike) => ({ fetch, now: () => Date.now(), timers: globalTimers });

  it("asks the display endpoint and returns a live payload", async () => {
    const payload = makePayload();
    const urls: string[] = [];
    const fetch: FetchLike = (url) => {
      urls.push(url);
      return Promise.resolve(jsonResponse(payload));
    };
    expect(await fetchDisplayPayload(depsWith(fetch))).toEqual({ kind: "live", payload });
    expect(urls).toEqual([DISPLAY_ENDPOINT]);
  });

  it("marks a payload the service worker served from its cache", async () => {
    const payload = makePayload();
    const fetch: FetchLike = () => Promise.resolve(jsonResponse(payload, { cached: true }));
    expect(await fetchDisplayPayload(depsWith(fetch))).toEqual({ kind: "cached", payload });
  });

  it("reports JSON that is not a payload as a bad response", async () => {
    const fetch: FetchLike = () => Promise.resolve(jsonResponse({ error: "maintenance" }));
    expect(await fetchDisplayPayload(depsWith(fetch))).toEqual({ kind: "bad-response" });
  });

  it("reports a captive portal page and an error status as a bad response", async () => {
    const portal: FetchLike = () => Promise.resolve(htmlResponse());
    const error: FetchLike = () => Promise.resolve(jsonResponse(makePayload(), { status: 503 }));
    expect(await fetchDisplayPayload(depsWith(portal))).toEqual({ kind: "bad-response" });
    expect(await fetchDisplayPayload(depsWith(error))).toEqual({ kind: "bad-response" });
  });

  it("reports a failed request as a network error", async () => {
    const fetch: FetchLike = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await fetchDisplayPayload(depsWith(fetch))).toEqual({ kind: "network-error" });
  });
});

describe("createDisplayStore", () => {
  type ServerMode = "ok" | "down" | "hang" | "cached" | "portal" | "error";

  /** A simulated device, network and server. */
  interface World {
    server: ServerMode;
    /** Build the server is running. */
    version: string;
    /** Replaces the timetable the server answers with. */
    days: DisplayPayload["days"] | null;
    /** Overrides the server clock in answers; null means the true time. */
    serverClock: number | null;
    latencyMs: number;
    online: boolean;
    visible: boolean;
    requests: number;
    storage: MemoryStorage | null;
    wentOnline: ReturnType<typeof createSignal>;
    wentOffline: ReturnType<typeof createSignal>;
    woke: ReturnType<typeof createSignal>;
    deps: DisplayStoreDeps;
  }

  function serverPayload(world: World): DisplayPayload {
    return overTheWire(
      makePayload({
        version: world.version,
        serverNow: world.serverClock === null ? Date.now() : world.serverClock,
        ...(world.days === null ? {} : { days: world.days }),
      }),
    );
  }

  function answer(world: World, mode: ServerMode): ResponseLike {
    if (mode === "portal") return htmlResponse();
    if (mode === "error") return jsonResponse({ error: "unavailable" }, { status: 503 });
    return jsonResponse(serverPayload(world), { cached: mode === "cached" });
  }

  function createWorld(initial: Partial<Pick<World, "server" | "online" | "visible" | "storage">> = {}): World {
    const world: World = {
      server: "ok",
      version: "build-1",
      days: null,
      serverClock: null,
      latencyMs: 50,
      online: true,
      visible: true,
      requests: 0,
      storage: new MemoryStorage(),
      wentOnline: createSignal(),
      wentOffline: createSignal(),
      woke: createSignal(),
      ...initial,
      deps: undefined as unknown as DisplayStoreDeps,
    };
    world.deps = {
      now: () => Date.now(),
      random: () => 0.5,
      timers: globalTimers,
      storage: world.storage,
      isOnline: () => world.online,
      isVisible: () => world.visible,
      onOnline: world.wentOnline.listen,
      onOffline: world.wentOffline.listen,
      onWake: world.woke.listen,
      fetch: () => {
        world.requests += 1;
        const mode = world.server;
        if (mode === "hang") return new Promise(() => undefined);
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (mode === "down") reject(new TypeError("Failed to fetch"));
            else resolve(answer(world, mode));
          }, world.latencyMs);
        });
      },
    };
    return world;
  }

  /** Subscribes and counts the notifications. */
  function watch(store: DisplayStore) {
    const seen = { notifications: 0 };
    const unsubscribe = store.subscribe(() => {
      seen.notifications += 1;
    });
    return { seen, unsubscribe };
  }

  /** A payload the server rendered into the page a moment ago. */
  const freshPage = () => makePayload({ serverNow: Date.now() - SECOND });
  /** A payload of a page that came out of an offline cache. */
  const cachedPage = () => makePayload({ serverNow: Date.now() - 3 * 24 * 60 * MINUTE });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SAMPLE_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when created and serves the page's payload as the server snapshot", () => {
    const world = createWorld();
    const initial = freshPage();
    const store = createDisplayStore(initial, () => world.deps);

    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(store.getServerSnapshot()).toEqual({
      payload: initial,
      status: "live",
      lastUpdatedMs: initial.serverNow,
      latestVersion: "build-1",
    });
    expect(world.requests).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(world.storage?.items.size).toBe(0);
  });

  it("does not refetch a page that has just been rendered, and polls every five minutes", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);
    expect(world.requests).toBe(0);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(world.requests).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(world.latencyMs + POLL_INTERVAL_MS - 1);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(2);
  });

  it("refetches at once when the page is old or the device clock disagrees with it", () => {
    for (const serverNow of [Date.now() - 2 * MINUTE, Date.now() + 2 * MINUTE]) {
      const world = createWorld();
      const store = createDisplayStore(makePayload({ serverNow }), () => world.deps);
      const { unsubscribe } = watch(store);
      expect(world.requests).toBe(1);
      unsubscribe();
    }
  });

  it("replaces the payload with a live answer, remembers it and tells its subscribers", async () => {
    const world = createWorld();
    world.days = [makeDay("2026-11-25", { ishaJamaat: "19:45" })];
    const store = createDisplayStore(cachedPage(), () => world.deps);
    const { seen } = watch(store);

    await vi.advanceTimersByTimeAsync(world.latencyMs);

    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe("live");
    expect(snapshot.payload.days[0].ishaJamaat).toBe("19:45");
    expect(snapshot.payload.serverNow).toBe(SAMPLE_NOW_MS + world.latencyMs);
    expect(snapshot.lastUpdatedMs).toBe(snapshot.payload.serverNow);
    expect(seen.notifications).toBe(1);
    expect(readStoredPayload(world.storage)).toEqual(snapshot.payload);
  });

  it("keeps the identity of everything a poll did not change", async () => {
    const world = createWorld();
    const initial = freshPage();
    const store = createDisplayStore(initial, () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + world.latencyMs);

    const { payload } = store.getSnapshot();
    expect(payload).not.toBe(initial);
    expect(payload.serverNow).toBeGreaterThan(initial.serverNow);
    expect(payload.days).toBe(initial.days);
    expect(payload.settings).toBe(initial.settings);
    expect(payload.announcements).toBe(initial.announcements);
  });

  it("keeps the last good payload through failures and backs off between attempts", async () => {
    const world = createWorld({ server: "down" });
    const initial = cachedPage();
    const store = createDisplayStore(initial, () => world.deps);
    const { seen } = watch(store);

    await vi.advanceTimersByTimeAsync(world.latencyMs);
    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getSnapshot().payload).toBe(initial);
    expect(seen.notifications).toBe(1);

    // 5 s, 10 s, 20 s after each failure.
    for (const [index, waitMs] of [5 * SECOND, 10 * SECOND, 20 * SECOND].entries()) {
      await vi.advanceTimersByTimeAsync(waitMs - 1);
      expect(world.requests).toBe(index + 1);
      await vi.advanceTimersByTimeAsync(1 + world.latencyMs);
      expect(world.requests).toBe(index + 2);
    }
    // Nothing changed for the subscribers while it kept failing.
    expect(seen.notifications).toBe(1);
    expect(store.getSnapshot().payload).toBe(initial);

    world.server = "ok";
    await vi.advanceTimersByTimeAsync(40 * SECOND + world.latencyMs);
    expect(store.getSnapshot().status).toBe("live");

    // Back to the calm cadence after a success.
    const requests = world.requests;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(world.requests).toBe(requests);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(requests + 1);
  });

  it("never waits longer than the poll interval between attempts of a long outage", async () => {
    const world = createWorld({ server: "down" });
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE);
    const requests = world.requests;
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS + world.latencyMs);
    expect(world.requests).toBe(requests + 1);
  });

  it("treats a request that gets no answer within ten seconds as a network failure", async () => {
    const world = createWorld({ server: "hang" });
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(store.getSnapshot().status).toBe("live");
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().status).toBe("offline");

    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(world.requests).toBe(2);
  });

  it("shows saved data as stale behind a captive portal or a failing server, and stores none of it", async () => {
    for (const server of ["portal", "error"] as const) {
      const world = createWorld({ server });
      const initial = cachedPage();
      const store = createDisplayStore(initial, () => world.deps);
      const { unsubscribe } = watch(store);

      await vi.advanceTimersByTimeAsync(world.latencyMs);

      expect(store.getSnapshot().status).toBe("stale");
      expect(store.getSnapshot().payload).toBe(initial);
      expect(readStoredPayload(world.storage)).toEqual(initial);
      unsubscribe();
    }
  });

  it("adopts a cached answer only when it is newer, and calls the result stale", async () => {
    const world = createWorld({ server: "cached" });
    world.serverClock = SAMPLE_NOW_MS - 60 * MINUTE;
    world.days = [makeDay("2026-11-25", { note: "from the cache" })];
    const initial = cachedPage();
    const store = createDisplayStore(initial, () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(world.latencyMs);
    expect(store.getSnapshot().status).toBe("stale");
    expect(store.getSnapshot().payload.days[0].note).toBe("from the cache");
    expect(store.getSnapshot().lastUpdatedMs).toBe(SAMPLE_NOW_MS - 60 * MINUTE);

    // The service worker now answers with something older than what is on screen.
    world.serverClock = SAMPLE_NOW_MS - 120 * MINUTE;
    world.days = [makeDay("2026-11-25", { note: "older still" })];
    await refreshNow(store, world);
    expect(store.getSnapshot().status).toBe("stale");
    expect(store.getSnapshot().payload.days[0].note).toBe("from the cache");

    // The same answer while the browser reports no network at all.
    world.online = false;
    await refreshNow(store, world);
    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getSnapshot().payload.days[0].note).toBe("from the cache");
  });

  it("keeps trying for a live answer at the failure pace while only the cache answers", async () => {
    const world = createWorld({ server: "cached" });
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(world.latencyMs + BACKOFF_BASE_MS);
    expect(world.requests).toBe(2);
  });

  it("accepts a live answer even when the server clock has gone back", async () => {
    const world = createWorld();
    world.serverClock = SAMPLE_NOW_MS - 60 * MINUTE;
    world.days = [makeDay("2026-11-25", { note: "authoritative" })];
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);

    await refreshNow(store, world);

    expect(store.getSnapshot().status).toBe("live");
    expect(store.getSnapshot().lastUpdatedMs).toBe(SAMPLE_NOW_MS - 60 * MINUTE);
    expect(store.getSnapshot().payload.days[0].note).toBe("authoritative");
  });

  it("reports offline as soon as the browser says so, and refetches when the network returns", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    const { seen } = watch(store);
    await vi.advanceTimersByTimeAsync(30 * SECOND);

    world.online = false;
    world.wentOffline.fire();
    expect(store.getSnapshot().status).toBe("offline");
    expect(seen.notifications).toBe(1);
    expect(world.requests).toBe(0);

    world.online = true;
    world.wentOnline.fire();
    expect(world.requests).toBe(1);
    // A second event while the request is under way changes nothing.
    world.wentOnline.fire();
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(world.latencyMs);
    expect(store.getSnapshot().status).toBe("live");
  });

  it("counts the page load as its latest fetch: events in its first moments do not repeat it", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);

    // The tab was opened in the background and is looked at ten seconds later.
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    world.woke.fire();
    expect(world.requests).toBe(0);

    await vi.advanceTimersByTimeAsync(WAKE_THROTTLE_MS - 10 * SECOND - 1);
    expect(world.requests).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(1);
  });

  it("starts out offline on a device without a network", () => {
    const world = createWorld({ online: false, server: "down" });
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);
    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getServerSnapshot().status).toBe("live");
  });

  it("spaces refetches for a flapping network at least five seconds apart", async () => {
    const world = createWorld();
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);
    await vi.advanceTimersByTimeAsync(world.latencyMs);
    expect(world.requests).toBe(1);

    world.wentOnline.fire();
    world.wentOnline.fire();
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(ONLINE_THROTTLE_MS - world.latencyMs - 1);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(2);
  });

  it("refetches when the page comes back on screen, at most once a minute", async () => {
    const world = createWorld();
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);
    await vi.advanceTimersByTimeAsync(20 * SECOND);
    expect(world.requests).toBe(1);

    // Twenty seconds after the last attempt: wait for the minute to be up.
    world.woke.fire();
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(WAKE_THROTTLE_MS - 20 * SECOND - 1);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(2);

    // Two minutes later: at once.
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    world.woke.fire();
    expect(world.requests).toBe(3);
  });

  it("does not let a wake-up postpone a retry that is already due sooner", async () => {
    const world = createWorld({ server: "down" });
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store);
    await vi.advanceTimersByTimeAsync(world.latencyMs + SECOND);

    // The retry is due in four seconds; the wake throttle would say fifty-nine.
    world.woke.fire();
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS - SECOND);
    expect(world.requests).toBe(2);
  });

  it("polls a hidden page every half hour", async () => {
    const world = createWorld({ visible: false });
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);

    await vi.advanceTimersByTimeAsync(HIDDEN_POLL_INTERVAL_MS - 1);
    expect(world.requests).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(1);
  });

  it("upgrades a page from an offline cache to the newer payload in storage, then confirms it", async () => {
    const world = createWorld({ server: "down" });
    const stored = makePayload({
      serverNow: Date.now() - 10 * SECOND,
      days: [makeDay("2026-11-25", { note: "stored" })],
    });
    world.storage?.items.set(STORAGE_KEY, storedRecord(stored));
    const store = createDisplayStore(cachedPage(), () => world.deps);
    const { seen } = watch(store);

    // Shown at once, before any request has been answered; marked as not confirmed.
    expect(store.getSnapshot().payload.days[0].note).toBe("stored");
    expect(store.getSnapshot().status).toBe("stale");
    expect(store.getSnapshot().lastUpdatedMs).toBe(stored.serverNow);
    expect(seen.notifications).toBe(1);
    // However recent the stored payload is, the server is asked straight away.
    expect(world.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(world.latencyMs);
    expect(store.getSnapshot().status).toBe("offline");
    expect(store.getSnapshot().payload.days[0].note).toBe("stored");

    world.server = "ok";
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS + world.latencyMs);
    expect(store.getSnapshot().status).toBe("live");
    expect(store.getSnapshot().payload.days[0].note).toBeNull();
  });

  it("replaces an older stored payload with the page's own", () => {
    const world = createWorld();
    world.storage?.items.set(STORAGE_KEY, storedRecord(cachedPage()));
    const initial = freshPage();
    const store = createDisplayStore(initial, () => world.deps);
    const { seen } = watch(store);

    expect(store.getSnapshot().payload).toBe(initial);
    expect(seen.notifications).toBe(0);
    expect(readStoredPayload(world.storage)).toEqual(initial);
  });

  it("works without storage, and with storage that throws", async () => {
    const broken = new MemoryStorage();
    broken.failReads = true;
    broken.failWrites = true;
    for (const storage of [null, broken]) {
      const world = createWorld({ storage });
      const store = createDisplayStore(cachedPage(), () => world.deps);
      const { unsubscribe } = watch(store);

      await vi.advanceTimersByTimeAsync(world.latencyMs);

      expect(store.getSnapshot().status).toBe("live");
      expect(store.getSnapshot().payload.serverNow).toBe(Date.now());
      unsubscribe();
    }
  });

  it("announces a deployment once per new build, and not the build the page runs", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    const announced: string[] = [];
    const stopListening = store.onVersionChange((version) => announced.push(version));
    watch(store);

    await refreshNow(store, world);
    expect(announced).toEqual([]);

    world.version = "build-2";
    await refreshNow(store, world);
    await refreshNow(store, world);
    expect(announced).toEqual(["build-2"]);
    expect(store.getSnapshot().latestVersion).toBe("build-2");
    expect(store.getServerSnapshot().latestVersion).toBe("build-1");

    world.version = "build-3";
    await refreshNow(store, world);
    expect(announced).toEqual(["build-2", "build-3"]);

    // A rollback to the build the page runs is no reason to reload.
    world.version = "build-1";
    await refreshNow(store, world);
    expect(announced).toEqual(["build-2", "build-3"]);
    expect(store.getSnapshot().latestVersion).toBe("build-1");

    world.version = "build-3";
    await refreshNow(store, world);
    expect(announced).toEqual(["build-2", "build-3", "build-3"]);

    stopListening();
    world.version = "build-4";
    await refreshNow(store, world);
    expect(announced).toHaveLength(3);
  });

  it("does not take a build id from a cached answer", async () => {
    const world = createWorld({ server: "cached" });
    world.version = "build-0";
    const store = createDisplayStore(cachedPage(), () => world.deps);
    const listener = vi.fn();
    store.onVersionChange(listener);
    watch(store);

    await vi.advanceTimersByTimeAsync(world.latencyMs);

    expect(store.getSnapshot().payload.version).toBe("build-0");
    expect(store.getSnapshot().latestVersion).toBe("build-1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps polling when a deployment listener throws", async () => {
    const world = createWorld();
    world.version = "build-2";
    const store = createDisplayStore(freshPage(), () => world.deps);
    store.onVersionChange(() => {
      throw new Error("listener failed");
    });
    watch(store);

    // The failure belongs to whoever asked for the refresh; it is not swallowed.
    const failure = expect(store.refresh()).rejects.toThrow("listener failed");
    await vi.advanceTimersByTimeAsync(world.latencyMs);
    await failure;

    expect(store.getSnapshot().latestVersion).toBe("build-2");
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(world.requests).toBe(2);
  });

  it("refreshes on demand, ignoring the throttles, with one request at a time", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    watch(store);

    const first = store.refresh();
    const second = store.refresh();
    expect(second).toBe(first);
    expect(world.requests).toBe(1);
    await vi.advanceTimersByTimeAsync(world.latencyMs);
    await first;
    expect(store.getSnapshot().payload.serverNow).toBe(Date.now());

    await refreshNow(store, world);
    expect(world.requests).toBe(2);

    // The regular poll is counted from the last refresh.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(world.requests).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(world.requests).toBe(3);
  });

  it("has nothing to refresh while nobody is subscribed", async () => {
    const world = createWorld();
    const store = createDisplayStore(freshPage(), () => world.deps);
    await store.refresh();
    expect(world.requests).toBe(0);
  });

  it("adopts a newer server render that is handed to it, and ignores an older one", () => {
    const world = createWorld();
    const initial = freshPage();
    const store = createDisplayStore(initial, () => world.deps);
    const { seen } = watch(store);

    const newer = makePayload({
      serverNow: initial.serverNow + 500,
      days: [makeDay("2026-11-25", { note: "re-rendered" })],
    });
    store.offer(newer);
    expect(store.getSnapshot().payload.days[0].note).toBe("re-rendered");
    expect(store.getSnapshot().lastUpdatedMs).toBe(newer.serverNow);
    expect(store.getSnapshot().payload.settings).toBe(initial.settings);
    expect(seen.notifications).toBe(1);
    expect(readStoredPayload(world.storage)).toEqual(newer);

    store.offer(initial);
    store.offer(newer);
    expect(store.getSnapshot().payload.days[0].note).toBe("re-rendered");
    expect(seen.notifications).toBe(1);
  });

  it("stops polling and listening with its last subscriber and ignores a late answer", async () => {
    const world = createWorld();
    const initial = cachedPage();
    const store = createDisplayStore(initial, () => world.deps);
    const first = watch(store);
    const second = watch(store);
    expect(world.requests).toBe(1);

    first.unsubscribe();
    expect(world.wentOnline.count()).toBe(1);
    second.unsubscribe();
    expect(world.wentOnline.count()).toBe(0);
    expect(world.wentOffline.count()).toBe(0);
    expect(world.woke.count()).toBe(0);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(store.getSnapshot().payload).toBe(initial);
    expect(second.seen.notifications).toBe(0);
    expect(world.requests).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resumes with the next subscriber", async () => {
    const world = createWorld();
    const store = createDisplayStore(cachedPage(), () => world.deps);
    watch(store).unsubscribe();
    await vi.advanceTimersByTimeAsync(MINUTE);

    const { seen } = watch(store);
    expect(world.requests).toBe(2);
    await vi.advanceTimersByTimeAsync(world.latencyMs);

    expect(store.getSnapshot().status).toBe("live");
    expect(seen.notifications).toBe(1);
  });

  /** Refreshes on demand and waits for the answer. */
  async function refreshNow(store: DisplayStore, world: World): Promise<void> {
    const pending = store.refresh();
    await vi.advanceTimersByTimeAsync(world.latencyMs);
    await pending;
  }
});
