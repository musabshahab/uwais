import { describe, expect, it, vi } from "vitest";
import { fullscreenControls, type FullscreenDocumentLike } from "./fullscreen";

type Flavour = "standard" | "webkit";

interface FakeDocument extends FullscreenDocumentLike {
  /** Listeners by event name. */
  listeners: Map<string, Set<() => void>>;
}

/**
 * A document with one flavour of the Fullscreen API. `grant` decides whether
 * a request to enter is honoured; `mode` how the browser answers it.
 */
function fakeDocument(
  flavour: Flavour,
  options: { grant?: boolean; mode?: "promise" | "sync"; stuck?: boolean } = {},
): FakeDocument {
  const { grant = true, mode = "promise", stuck = false } = options;
  const elementKey = flavour === "standard" ? "fullscreenElement" : "webkitFullscreenElement";
  const eventName = flavour === "standard" ? "fullscreenchange" : "webkitfullscreenchange";
  const listeners = new Map<string, Set<() => void>>();
  const root = {};

  const doc: FakeDocument = {
    listeners,
    documentElement: root,
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  doc[elementKey] = null;

  const change = (element: unknown) => {
    doc[elementKey] = element;
    listeners.get(eventName)?.forEach((listener) => listener());
  };
  const request = vi.fn(() => {
    if (mode === "sync") {
      if (grant) change(root);
      return undefined;
    }
    if (!grant) return Promise.reject(new TypeError("Permissions check failed"));
    change(root);
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    if (stuck) return Promise.reject(new TypeError("Not allowed"));
    change(null);
    return mode === "sync" ? undefined : Promise.resolve();
  });

  if (flavour === "standard") {
    doc.documentElement.requestFullscreen = request;
    doc.exitFullscreen = exit;
  } else {
    doc.documentElement.webkitRequestFullscreen = request;
    doc.webkitExitFullscreen = exit;
  }
  return doc;
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error("expected full-screen controls");
  return value;
}

describe("fullscreenControls", () => {
  it("is null where the browser has no Fullscreen API", () => {
    const doc: FullscreenDocumentLike = {
      documentElement: {},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    expect(fullscreenControls(doc)).toBeNull();
  });

  it("is null where the page is not allowed to go full screen", () => {
    const standard = fakeDocument("standard");
    standard.fullscreenEnabled = false;
    expect(fullscreenControls(standard)).toBeNull();

    const prefixed = fakeDocument("webkit");
    prefixed.webkitFullscreenEnabled = false;
    expect(fullscreenControls(prefixed)).toBeNull();
  });

  it("is available where the browser does not say whether it is allowed", () => {
    expect(fullscreenControls(fakeDocument("standard"))).not.toBeNull();
    const enabled = fakeDocument("standard");
    enabled.fullscreenEnabled = true;
    expect(fullscreenControls(enabled)).not.toBeNull();
  });

  it.each(["standard", "webkit"] as const)("enters and leaves full-screen mode (%s API)", async (flavour) => {
    const doc = fakeDocument(flavour);
    const controls = must(fullscreenControls(doc));
    expect(controls.isActive()).toBe(false);

    expect(await controls.enter()).toBe(true);
    expect(controls.isActive()).toBe(true);

    expect(await controls.exit()).toBe(true);
    expect(controls.isActive()).toBe(false);
  });

  it("works with old browsers whose methods return nothing", async () => {
    const controls = must(fullscreenControls(fakeDocument("webkit", { mode: "sync" })));
    expect(await controls.enter()).toBe(true);
    expect(await controls.exit()).toBe(true);
  });

  it("reports a refused request as false instead of rejecting", async () => {
    const doc = fakeDocument("standard", { grant: false });
    const controls = must(fullscreenControls(doc));

    expect(await controls.enter()).toBe(false);
    expect(controls.isActive()).toBe(false);
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("reports a failed exit as false instead of rejecting", async () => {
    const controls = must(fullscreenControls(fakeDocument("standard", { stuck: true })));
    await controls.enter();

    expect(await controls.exit()).toBe(false);
    expect(controls.isActive()).toBe(true);
  });

  it("does not ask the browser for the state the page is already in", async () => {
    const doc = fakeDocument("standard");
    const controls = must(fullscreenControls(doc));

    expect(await controls.exit()).toBe(true);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();

    await controls.enter();
    expect(await controls.enter()).toBe(true);
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("prefers the standard API when a browser has both", async () => {
    const doc = fakeDocument("standard");
    const prefixedRequest = vi.fn();
    doc.documentElement.webkitRequestFullscreen = prefixedRequest;
    // The prefixed state says "active"; only the standard one counts.
    doc.webkitFullscreenElement = {};
    const controls = must(fullscreenControls(doc));

    expect(controls.isActive()).toBe(false);
    await controls.enter();

    expect(prefixedRequest).not.toHaveBeenCalled();
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["standard", "fullscreenchange"],
    ["webkit", "webkitfullscreenchange"],
  ] as const)("tells its listeners about every change (%s API)", async (flavour, eventName) => {
    const doc = fakeDocument(flavour);
    const controls = must(fullscreenControls(doc));
    const listener = vi.fn();

    const stop = controls.onChange(listener);
    expect(Array.from(doc.listeners.keys())).toEqual([eventName]);
    await controls.enter();
    await controls.exit();
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    await controls.enter();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(doc.listeners.get(eventName)?.size).toBe(0);
  });
});
