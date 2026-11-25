/**
 * Keeps the public pages readable with JavaScript switched off.
 *
 * The pages stream: the server sends the static shell with placeholders
 * first, then the data-driven parts as hidden blocks at the end of the
 * document (`<div hidden id="S:...">`), and a small inline script moves each
 * block into its placeholder. Without JavaScript that last step never runs
 * and a visitor would be left looking at placeholders, although the prayer
 * times are in the HTML they received.
 *
 * The stylesheet below is wrapped in `<noscript>`, so it only exists for
 * those visitors. It shows the streamed blocks and uses flexbox ordering to
 * put them where they belong, and hides the placeholders and the controls
 * that cannot work without a script. It costs everyone else nothing, and if
 * the streaming format ever changes the worst case is the placeholders that
 * were there before.
 *
 * How to take part in it:
 * - `noScriptReveal(region)` on the root element of streamed content;
 * - `NOSCRIPT_FALLBACK` on its placeholder;
 * - `NEEDS_SCRIPT` on anything that only works with JavaScript.
 */

/** Where a streamed block is shown when JavaScript is off. */
export type NoScriptRegion = "name" | "main" | "contact";

/** Marks the root element of streamed content: `{...noScriptReveal("main")}`. */
export function noScriptReveal(region: NoScriptRegion): { "data-noscript": NoScriptRegion } {
  return { "data-noscript": region };
}

/** Marks a placeholder that a streamed block replaces. */
export const NOSCRIPT_FALLBACK = { "data-noscript-fallback": "" } as const;

/** Marks a control or panel that has nothing to offer without JavaScript. */
export const NEEDS_SCRIPT = { "data-needs-script": "" } as const;

/** Marks the element that wraps header, main and footer; its children are re-ordered among the streamed blocks. */
export const SITE_FRAME = { "data-site-frame": "" } as const;

const STREAMED = "body > div[hidden]:has(> [data-noscript";

/*
 * Tailwind's base layer hides every [hidden] element with `!important`.
 * Among important declarations an earlier cascade layer wins, so the reveal
 * is declared in the `theme` layer, which comes before `base`.
 */
const NOSCRIPT_CSS = `
@layer theme {
  ${STREAMED}]) { display: block !important; }
  ${STREAMED}="name"]) { display: flex !important; }
}
body { display: flex; flex-direction: column; }
[data-site-frame] { display: contents; }
[data-site-frame] > header { order: 1; }
[data-site-frame] > main { order: 2; flex: none; }
${STREAMED}="main"]) { order: 3; flex: 1 0 auto; }
[data-site-frame] > footer { order: 4; }
${STREAMED}="contact"]) { order: 5; padding: 0 var(--spacing-gutter) 2.5rem; background-color: var(--surface); color: var(--fg-muted); }
${STREAMED}="contact"]) > * { max-width: calc(72rem - 2 * var(--spacing-gutter)); margin-inline: auto; }
${STREAMED}="name"]) {
  position: absolute;
  top: 0;
  left: calc(max(0px, (100vw - 72rem) / 2) + var(--spacing-gutter) + 2.625rem);
  right: 4rem;
  height: 3.5rem;
  align-items: center;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.025em;
  color: var(--fg);
  white-space: nowrap;
  pointer-events: none;
}
@media (min-width: 40rem) {
  ${STREAMED}="name"]) {
    left: calc(max(0px, (100vw - 72rem) / 2) + var(--spacing-gutter) + 2.75rem);
    right: calc(max(0px, (100vw - 72rem) / 2) + var(--spacing-gutter) + 15rem);
    height: 4rem;
    font-size: var(--text-xl);
  }
}
[data-noscript-fallback], [data-needs-script] { display: none !important; }
`;

/**
 * The no-JavaScript stylesheet. Rendered once by the site layout. Server
 * Component.
 */
export function NoScriptStyles() {
  return (
    <noscript>
      <style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} />
    </noscript>
  );
}
