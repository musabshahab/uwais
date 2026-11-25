import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClasses, isExternalHref } from "./button";
import { IconButton } from "./icon-button";

const html = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);

/**
 * Renders an IconButton around `icon`. The icon is a required `children`
 * prop, which `createElement` only accepts among the props while the lint
 * rules only accept it as an argument; viewing the component through the
 * props these tests use satisfies both.
 */
function iconButton(props: { label: string; loading?: boolean; href?: string }, icon: ReactNode = createElement("svg")): string {
  return html(createElement(IconButton as FunctionComponent<typeof props>, props, icon));
}

describe("isExternalHref", () => {
  it.each(["https://example.org/donate", "http://example.org", "//cdn.example.org/x", "mailto:info@example.org", "tel:+441614960000", "HTTPS://EXAMPLE.ORG"])(
    "treats %s as leaving the app",
    (href) => {
      expect(isExternalHref(href)).toBe(true);
    },
  );

  it.each(["/timetable", "/admin/import?step=2", "timetable", "#today", "?month=2026-03", "./tv", "/a:b", ""])("treats %j as an internal path", (href) => {
    expect(isExternalHref(href)).toBe(false);
  });
});

describe("buttonClasses", () => {
  it("defaults to a primary button of the standard 44px height", () => {
    const classes = buttonClasses();
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("min-h-control");
    expect(classes).not.toContain("w-full");
  });

  it("gives the small size a hit area that is taller than the button", () => {
    expect(buttonClasses({ size: "sm" })).toContain("after:-inset-y-1");
    expect(buttonClasses({ size: "sm", square: true })).toContain("after:-inset-1");
  });

  it("makes icon buttons square and full-width buttons wide", () => {
    expect(buttonClasses({ square: true })).toContain("size-control");
    expect(buttonClasses({ fullWidth: true })).toContain("w-full");
  });

  it("uses a different fill for each variant", () => {
    const fills = (["primary", "secondary", "ghost", "danger"] as const).map((variant) => buttonClasses({ variant }));
    expect(new Set(fills).size).toBe(4);
    expect(fills[3]).toContain("bg-danger");
  });
});

describe("Button", () => {
  it('renders type="button" unless told otherwise, so it never submits a form by accident', () => {
    expect(html(createElement(Button, null, "Save"))).toMatch(/^<button type="button"/);
    expect(html(createElement(Button, { type: "submit" }, "Save"))).toMatch(/^<button type="submit"/);
  });

  it("is natively disabled and busy while loading, and shows the loading label", () => {
    const markup = html(createElement(Button, { loading: true, loadingLabel: "Saving" }, "Save settings"));
    expect(markup).toContain(" disabled=");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Saving");
    expect(markup).not.toContain("Save settings");
    // The spinner is decoration here: the button itself is the busy element.
    expect(markup).not.toContain('role="status"');
  });

  it("keeps its own label while loading when no loading label is given", () => {
    expect(html(createElement(Button, { loading: true }, "Save settings"))).toContain("Save settings");
  });

  it("replaces the start icon with the spinner while loading", () => {
    const icon = createElement("svg", { "data-icon": "upload" });
    expect(html(createElement(Button, { iconStart: icon }, "Import"))).toContain('data-icon="upload"');
    expect(html(createElement(Button, { iconStart: icon, loading: true }, "Import"))).not.toContain('data-icon="upload"');
  });

  it("is not busy and not disabled by default", () => {
    const markup = html(createElement(Button, null, "Save"));
    expect(markup).not.toContain("aria-busy");
    expect(markup).not.toContain(" disabled=");
  });

  it("renders an internal link as an anchor with the path", () => {
    const markup = html(createElement(Button, { href: "/timetable", variant: "secondary" }, "Full timetable"));
    expect(markup).toMatch(/^<a /);
    expect(markup).toContain('href="/timetable"');
    expect(markup).not.toContain("type=");
  });

  it("renders an external link as a plain anchor", () => {
    const markup = html(createElement(Button, { href: "https://maps.example.org/?q=mosque" }, "Get directions"));
    expect(markup).toMatch(/^<a href="https:\/\/maps\.example\.org\/\?q=mosque"/);
    expect(markup).not.toContain("rel=");
  });

  it("protects the opener when an external link opens a new tab, keeping any rel it was given", () => {
    const plain = html(createElement(Button, { href: "https://example.org", target: "_blank" }, "Donate"));
    expect(plain).toContain('rel="noopener noreferrer"');
    const withRel = html(createElement(Button, { href: "https://example.org", target: "_blank", rel: "nofollow" }, "Donate"));
    expect(withRel).toContain('rel="nofollow noopener noreferrer"');
  });

  it("turns a disabled link into an inert, announced-as-disabled link without a destination", () => {
    const markup = html(createElement(Button, { href: "/admin/import", disabled: true }, "Import"));
    expect(markup).toContain('role="link"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain("href=");
  });

  it("appends custom classes after its own", () => {
    const markup = html(createElement(Button, { className: "mt-4" }, "Save"));
    expect(markup).toMatch(/class="[^"]*bg-primary[^"]* mt-4"/);
  });
});

describe("IconButton", () => {
  it("names the button with its label, as both accessible name and tooltip", () => {
    const markup = iconButton({ label: "Delete announcement" });
    expect(markup).toMatch(/^<button type="button"/);
    expect(markup).toContain('aria-label="Delete announcement"');
    expect(markup).toContain('title="Delete announcement"');
  });

  it("is a quiet square by default", () => {
    const markup = iconButton({ label: "Edit" });
    expect(markup).toContain("size-control");
    expect(markup).not.toContain("bg-primary");
  });

  it("swaps the icon for a spinner and blocks clicks while loading", () => {
    const markup = iconButton({ label: "Delete", loading: true }, createElement("svg", { "data-icon": "trash" }));
    expect(markup).toContain(" disabled=");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('data-icon="trash"');
  });

  it("keeps its name when it is a link", () => {
    const markup = iconButton({ label: "Open the TV display", href: "/tv" });
    expect(markup).toMatch(/^<a /);
    expect(markup).toContain('aria-label="Open the TV display"');
    expect(markup).toContain('href="/tv"');
  });
});
