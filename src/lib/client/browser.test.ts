import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserFetch,
  browserStorage,
  browserTimers,
  isDocumentVisible,
  isNavigatorOnline,
  onPageWake,
  onWindowEvent,
} from "./browser";
import type { FetchInit } from "./http";
import { jsonResponse } from "./testing";

/** A minimal event target that records its listeners. */
function fakeTarget() {
  const listeners = new Map<string, Set<(event: object) => void>>();
  return {
    listeners,
    addEventListener(type: string, listener: (event: object) => void) {
      const set = listeners.get(type) ?? new Set<(event: object) => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: (event: object) => void) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string, event: object = {}) {
      listeners.get(type)?.forEach((listener) => listener(event));
    },
    count: () => Array.from(listeners.values()).reduce((total, set) => total + set.size, 0),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserStorage", () => {
  it("returns the storage area when the browser allows it", () => {
    const localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    vi.stubGlobal("window", { localStorage });
    expect(browserStorage("localStorage")).toBe(localStorage);
  });

  it("returns null where reading the property throws", () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("SecurityError: the operation is insecure");
      },
    });
    expect(browserStorage("localStorage")).toBeNull();
  });

  it("returns null where the area does not exist", () => {
    vi.stubGlobal("window", { localStorage: null });
    expect(browserStorage("localStorage")).toBeNull();
    expect(browserStorage("sessionStorage")).toBeNull();
  });
});

describe("isDocumentVisible", () => {
  it("is false only for a page that reports itself hidden", () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    expect(isDocumentVisible()).toBe(false);
    vi.stubGlobal("document", { visibilityState: "visible" });
    expect(isDocumentVisible()).toBe(true);
    // A browser without the Page Visibility API.
    vi.stubGlobal("document", {});
    expect(isDocumentVisible()).toBe(true);
  });
});

describe("isNavigatorOnline", () => {
  it("is false only when the browser says it has no network", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNavigatorOnline()).toBe(false);
    vi.stubGlobal("navigator", { onLine: true });
    expect(isNavigatorOnline()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(isNavigatorOnline()).toBe(true);
  });
});

describe("onWindowEvent", () => {
  it("listens until told to stop", () => {
    const window = fakeTarget();
    vi.stubGlobal("window", window);
    const listener = vi.fn();

    const stop = onWindowEvent("online", listener);
    window.fire("online");
    window.fire("offline");
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    window.fire("online");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.count()).toBe(0);
  });
});

describe("onPageWake", () => {
  it("fires when the tab becomes visible, not when it is hidden", () => {
    const window = fakeTarget();
    const document = { ...fakeTarget(), visibilityState: "visible" };
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    const listener = vi.fn();
    onPageWake(listener);

    document.visibilityState = "hidden";
    document.fire("visibilitychange");
    expect(listener).not.toHaveBeenCalled();

    document.visibilityState = "visible";
    document.fire("visibilitychange");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fires when the page is restored from the back/forward cache, not at the end of a page load", () => {
    const window = fakeTarget();
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", { ...fakeTarget(), visibilityState: "visible" });
    const listener = vi.fn();
    onPageWake(listener);

    window.fire("pageshow", { persisted: false });
    expect(listener).not.toHaveBeenCalled();

    window.fire("pageshow", { persisted: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes both of its listeners", () => {
    const window = fakeTarget();
    const document = { ...fakeTarget(), visibilityState: "visible" };
    vi.stubGlobal("window", window);
    vi.stubGlobal("document", document);
    const listener = vi.fn();

    const stop = onPageWake(listener);
    expect(window.count() + document.count()).toBe(2);
    stop();

    expect(window.count() + document.count()).toBe(0);
    window.fire("pageshow", { persisted: true });
    document.fire("visibilitychange");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("browserTimers and browserFetch", () => {
  it("go through the window as it is at the time of the call", async () => {
    const response = jsonResponse({ ok: true });
    const fetch = vi.fn(() => Promise.resolve(response));
    const setTimeout = vi.fn(() => 7);
    const clearTimeout = vi.fn();
    // Installed after the module was loaded, as a service worker shim would be.
    vi.stubGlobal("window", { fetch, setTimeout, clearTimeout });
    const callback = () => undefined;
    const init: FetchInit = { cache: "no-store", credentials: "same-origin", headers: {} };

    expect(await browserFetch("/api/version", init)).toBe(response);
    expect(fetch).toHaveBeenCalledWith("/api/version", init);

    expect(browserTimers.setTimeout(callback, 250)).toBe(7);
    expect(setTimeout).toHaveBeenCalledWith(callback, 250);
    browserTimers.clearTimeout(7);
    expect(clearTimeout).toHaveBeenCalledWith(7);
  });
});
