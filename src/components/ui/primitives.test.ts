import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert } from "./alert";
import { Arabic } from "./arabic";
import { Badge } from "./badge";
import { Card, CardTitle } from "./card";
import { EmptyState } from "./empty-state";
import { Label } from "./label";
import { SegmentedControl } from "./segmented-control";
import { SkeletonText } from "./skeleton";
import { Spinner } from "./spinner";
import { Status } from "./status";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "./table";
import { VisuallyHidden } from "./visually-hidden";

const html = (element: ReactElement): string => renderToStaticMarkup(element);
const count = (markup: string, pattern: RegExp): number => (markup.match(pattern) ?? []).length;

describe("Arabic", () => {
  it("declares the language and direction of the text it wraps", () => {
    expect(html(createElement(Arabic, null, "الفجر"))).toBe('<span lang="ar" dir="rtl" class="arabic">الفجر</span>');
  });

  it("renders the requested element and keeps extra classes", () => {
    const markup = html(createElement(Arabic, { as: "p", className: "text-2xl" }, "العصر"));
    expect(markup).toBe('<p lang="ar" dir="rtl" class="arabic text-2xl">العصر</p>');
  });
});

describe("VisuallyHidden", () => {
  it("keeps the text in the document for screen readers", () => {
    expect(html(createElement(VisuallyHidden, null, "Prayer times"))).toBe('<span class="sr-only">Prayer times</span>');
    expect(html(createElement(VisuallyHidden, { as: "h2" }, "Today"))).toMatch(/^<h2 class="sr-only">/);
  });
});

describe("Spinner", () => {
  it("announces what is loading", () => {
    const markup = html(createElement(Spinner, { label: "Loading timetable" }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('<span class="sr-only">Loading timetable</span>');
  });

  it('says "Loading" when no label is given', () => {
    expect(html(createElement(Spinner))).toContain(">Loading</span>");
  });

  it("is silent decoration when the label is null", () => {
    const markup = html(createElement(Spinner, { label: null }));
    expect(markup).not.toContain("role=");
    expect(markup).not.toContain("sr-only");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("is exempt from the reduced-motion rule, because its motion is the message", () => {
    expect(html(createElement(Spinner))).toContain('data-motion="essential"');
  });
});

describe("Status", () => {
  it("is a polite live region that exists even when it has nothing to say", () => {
    const empty = html(createElement(Status, null, null));
    expect(empty).toBe('<div role="status" aria-live="polite" aria-atomic="true" class=""></div>');
  });

  it.each([undefined, null, false, ""])("treats %j as no message", (children) => {
    expect(html(createElement(Status, { tone: "success" }, children))).not.toContain("<span>");
  });

  it("shows the message with an icon for its tone", () => {
    const markup = html(createElement(Status, { tone: "success" }, "Saved"));
    expect(markup).toContain("<span>Saved</span>");
    expect(markup).toContain("<svg");
    expect(markup).toContain("text-success-fg");
  });

  it("interrupts for errors", () => {
    const markup = html(createElement(Status, { tone: "danger" }, "Could not reach the server."));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
  });

  it("shows the number zero, which is a message", () => {
    expect(html(createElement(Status, null, 0))).toContain("<span>0</span>");
  });
});

describe("Alert", () => {
  it("is plain content unless it is asked to announce itself", () => {
    expect(html(createElement(Alert, { tone: "danger", title: "This file could not be read" }))).not.toContain("role=");
  });

  it.each([
    ["danger", "alert"],
    ["warning", "alert"],
    ["success", "status"],
    ["info", "status"],
  ] as const)("announces a %s message with role=%s", (tone, role) => {
    expect(html(createElement(Alert, { tone, announce: true }, "Message"))).toContain(`role="${role}"`);
  });

  it("renders title, body and actions", () => {
    const markup = html(
      createElement(Alert, { tone: "warning", title: "3 rows were skipped", actions: createElement("button", null, "Show skipped rows") }, "Their dates could not be read."),
    );
    expect(markup).toContain("3 rows were skipped");
    expect(markup).toContain("Their dates could not be read.");
    expect(markup).toContain("<button>Show skipped rows</button>");
    expect(markup).toContain("bg-warning-soft");
  });
});

describe("Badge", () => {
  it("is a soft neutral label by default", () => {
    expect(html(createElement(Badge, null, "Draft"))).toMatch(/bg-surface-sunken[^"]*">Draft<\/span>$/);
  });

  it("pairs every solid fill with its own text colour", () => {
    for (const tone of ["brand", "accent", "success", "warning", "danger", "info"] as const) {
      const markup = html(createElement(Badge, { tone, variant: "solid" }, "x"));
      expect(markup).toContain(`bg-${tone} text-on-${tone}`);
    }
  });
});

describe("Card", () => {
  it("renders the requested element", () => {
    expect(html(createElement(Card, { as: "section" }, "x"))).toMatch(/^<section /);
    expect(html(createElement(Card, null, "x"))).toMatch(/^<div /);
  });

  it("lets the title take the heading level the page outline needs", () => {
    expect(html(createElement(CardTitle, null, "Today"))).toMatch(/^<h2 /);
    expect(html(createElement(CardTitle, { as: "h3" }, "Today"))).toMatch(/^<h3 /);
  });
});

describe("Label", () => {
  it("points at its control and can mark it optional", () => {
    const markup = html(createElement(Label, { htmlFor: "phone", optional: true }, "Phone"));
    expect(markup).toContain('for="phone"');
    expect(markup).toContain("(optional)");
  });
});

describe("SkeletonText", () => {
  const bars = (lines?: number): number => count(html(createElement(SkeletonText, { lines })), /animate-skeleton/g);

  it("draws one bar per line, three by default", () => {
    expect(bars()).toBe(3);
    expect(bars(5)).toBe(5);
  });

  it("always draws at least one bar, whatever number it is given", () => {
    expect(bars(0)).toBe(1);
    expect(bars(-4)).toBe(1);
    expect(bars(2.9)).toBe(2);
  });

  it("shortens the last line of a paragraph but not a single line", () => {
    expect(html(createElement(SkeletonText, { lines: 3 }))).toContain("w-3/5");
    expect(html(createElement(SkeletonText, { lines: 1 }))).not.toContain("w-3/5");
  });

  it("is hidden from assistive technology", () => {
    expect(html(createElement(SkeletonText))).toMatch(/^<span aria-hidden="true"/);
  });
});

describe("EmptyState", () => {
  it("uses the heading level it is given", () => {
    expect(html(createElement(EmptyState, { title: "No announcements yet" }))).toContain("<h2 ");
    expect(html(createElement(EmptyState, { title: "No announcements yet", headingLevel: "h3" }))).toContain("<h3 ");
  });

  it("leaves out the parts it was not given", () => {
    const markup = html(createElement(EmptyState, { title: "No announcements yet" }));
    expect(markup).not.toContain("<p");
    expect(markup).not.toContain("aria-hidden");
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "12h", label: "12-hour" },
    { value: "24h", label: "24-hour" },
  ] as const;
  const render = (props: Record<string, unknown> = {}): string =>
    html(createElement(SegmentedControl<"12h" | "24h">, { name: "timeFormat", label: "Time format", options, ...props }));

  it("is a named group of radios that share one field name", () => {
    const markup = render();
    expect(markup).toMatch(/^<fieldset/);
    expect(markup).toContain('<legend class="sr-only">Time format</legend>');
    const radios = markup.match(/<input[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    for (const tag of radios) {
      expect(tag).toContain('type="radio"');
      expect(tag).toContain('name="timeFormat"');
    }
    expect(markup).toContain('value="12h"');
    expect(markup).toContain('value="24h"');
  });

  /** The `<input>` tag of the option with this value. */
  const radio = (markup: string, value: string): string => (markup.match(/<input[^>]*>/g) ?? []).find((tag) => tag.includes(`value="${value}"`)) ?? "";

  it("checks nothing until it is given a value", () => {
    expect(count(render(), / checked=""/g)).toBe(0);
  });

  it("checks the default value when uncontrolled", () => {
    const markup = render({ defaultValue: "24h" });
    expect(count(markup, / checked=""/g)).toBe(1);
    expect(radio(markup, "24h")).toContain(' checked=""');
  });

  it("checks the controlled value", () => {
    const markup = render({ value: "12h", onChange: () => undefined });
    expect(count(markup, / checked=""/g)).toBe(1);
    expect(radio(markup, "12h")).toContain(' checked=""');
  });

  it("can show its label and can be disabled as a whole", () => {
    expect(render({ showLabel: true })).not.toContain('<legend class="sr-only">');
    expect(render({ disabled: true })).toMatch(/^<fieldset disabled=""/);
  });
});

describe("Table", () => {
  const table = (props: Record<string, unknown> = {}, highlight = false): string =>
    html(
      createElement(
        Table,
        { label: "Prayer times for March 2026", ...props },
        createElement(TableHead, null, createElement(TableRow, null, createElement(TableHeaderCell, null, "Date"), createElement(TableHeaderCell, { numeric: true }, "Fajr"))),
        createElement(
          TableBody,
          null,
          createElement(TableRow, { highlight }, createElement(TableHeaderCell, { scope: "row" }, "Fri 6"), createElement(TableCell, { numeric: true }, "5:02")),
        ),
      ),
    );

  it("sits in a named, keyboard-scrollable region", () => {
    const markup = table();
    expect(markup).toMatch(/^<div role="region" aria-label="Prayer times for March 2026" tabindex="0"/);
    expect(markup).toContain("overflow-auto");
  });

  it("scopes heading cells to their column unless told they head a row", () => {
    const markup = table();
    expect(markup).toMatch(/<th scope="col"[^>]*>Date<\/th>/);
    expect(markup).toMatch(/<th scope="row"[^>]*>Fri 6<\/th>/);
  });

  it("right-aligns figures and sets them in tabular numerals", () => {
    const markup = table();
    expect(markup).toMatch(/<td class="[^"]*numerals text-right[^"]*">5:02<\/td>/);
    expect(markup).toMatch(/<th scope="col" class="[^"]*text-right[^"]*">Fajr<\/th>/);
  });

  it("marks the highlighted row so that zebra striping skips it", () => {
    expect(table({}, true)).toContain('<tr data-highlight="" class="bg-accent-soft print-exact">');
    expect(table({}, false)).not.toContain("data-highlight");
  });

  it("only adds the options that are asked for", () => {
    const plain = table();
    expect(plain).not.toContain("nth-child(even)");
    expect(plain).not.toContain("sticky");
    expect(plain).not.toContain("max-height");

    const full = table({ zebra: true, stickyHeader: true, stickyFirstColumn: true, maxHeight: "20rem" });
    expect(full).toContain("nth-child(even)");
    expect(full).toContain("[&amp;_thead_th]:sticky");
    expect(full).toContain("[&amp;_tr&gt;*:first-child]:sticky");
    expect(full).toContain('style="max-height:20rem"');
  });

  it("gives the pinned column an opaque fill for plain, striped and highlighted rows", () => {
    const pinned = table({ stickyFirstColumn: true });
    expect(pinned).toContain("[&amp;_tbody&gt;tr&gt;*:first-child]:bg-surface");
    expect(pinned).toContain("[&amp;_tbody&gt;tr[data-highlight]&gt;*:first-child]:bg-accent-soft");
    expect(pinned).not.toContain(":first-child]:bg-surface-sunken");
    expect(table({ stickyFirstColumn: true, zebra: true })).toContain(":first-child]:bg-surface-sunken");
  });

  it("renders a visible caption when given one", () => {
    expect(table({ caption: "Times are for Manchester." })).toContain("<caption");
    expect(table()).not.toContain("<caption");
  });
});
