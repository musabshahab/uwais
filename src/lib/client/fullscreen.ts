/**
 * Full-screen mode for the TV page, over the standard Fullscreen API and the
 * `webkit`-prefixed one that older TV browsers still ship. The document is an
 * argument so the choice between the two can be tested without a browser.
 */

/** The fullscreen methods of an element, standard and prefixed. */
export interface FullscreenElementLike {
  requestFullscreen?(): Promise<void> | void;
  webkitRequestFullscreen?(): Promise<void> | void;
}

/** The fullscreen surface of a document, standard and prefixed. */
export interface FullscreenDocumentLike {
  documentElement: FullscreenElementLike;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?(): Promise<void> | void;
  webkitExitFullscreen?(): Promise<void> | void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Full-screen mode of a page. */
export interface FullscreenControls {
  /** Whether the page is in full-screen mode right now. */
  isActive(): boolean;
  /**
   * Asks the browser to show the page full screen. Browsers only allow this
   * in response to a click or key press.
   * @returns Whether the page is full screen afterwards; never rejects.
   */
  enter(): Promise<boolean>;
  /**
   * Leaves full-screen mode.
   * @returns Whether the page is out of full-screen mode afterwards; never rejects.
   */
  exit(): Promise<boolean>;
  /** Subscribes to entering and leaving full-screen mode; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/**
 * The full-screen controls of a document, or null when the browser offers
 * none or the page is not allowed to use them (an embedding frame without
 * the `allowfullscreen` permission).
 */
export function fullscreenControls(doc: FullscreenDocumentLike): FullscreenControls | null {
  const root = doc.documentElement;
  const standard = typeof root.requestFullscreen === "function";
  const prefixed = !standard && typeof root.webkitRequestFullscreen === "function";
  if (!standard && !prefixed) return null;
  if ((standard ? doc.fullscreenEnabled : doc.webkitFullscreenEnabled) === false) return null;

  const eventName = standard ? "fullscreenchange" : "webkitfullscreenchange";
  const isActive = (): boolean => {
    const element = standard ? doc.fullscreenElement : doc.webkitFullscreenElement;
    return element !== null && element !== undefined;
  };
  /** Runs a request that may reject (no user gesture, denied) or, in old browsers, return nothing. */
  const attempt = async (request: () => Promise<void> | void): Promise<void> => {
    try {
      await request();
    } catch {
      // The caller learns the outcome from the state it gets back.
    }
  };

  return {
    isActive,
    async enter() {
      if (isActive()) return true;
      await attempt(() =>
        standard ? root.requestFullscreen?.() : root.webkitRequestFullscreen?.(),
      );
      return isActive();
    },
    async exit() {
      if (!isActive()) return true;
      await attempt(() => (standard ? doc.exitFullscreen?.() : doc.webkitExitFullscreen?.()));
      return !isActive();
    },
    onChange(listener) {
      doc.addEventListener(eventName, listener);
      return () => doc.removeEventListener(eventName, listener);
    },
  };
}
