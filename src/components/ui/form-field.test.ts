import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import { FormField, describedBy, errorMessages, type FormFieldProps } from "./form-field";
import { Input } from "./input";
import { Select } from "./select";
import { Switch } from "./switch";
import { Textarea } from "./textarea";

const html = (element: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(element);

/** The value of `name` on the first tag matching `tagPattern`, or null when the attribute is absent. */
function attribute(markup: string, tagPattern: RegExp, name: string): string | null {
  const tag = markup.match(tagPattern)?.[0] ?? "";
  const found = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return found ? found[1] : null;
}

const INPUT = /<input[^>]*>/;

type FieldProps = Omit<FormFieldProps, "children">;

/**
 * Renders a field around one control. The control is a required `children`
 * prop, which `createElement` only accepts among the props while the lint
 * rules only accept it as an argument; viewing the component without that
 * prop satisfies both.
 */
function field(props: FieldProps, control: FormFieldProps["children"] = createElement(Input)): string {
  return html(createElement(FormField as FunctionComponent<FieldProps>, props, control));
}

describe("describedBy", () => {
  it("joins the ids that are present, in order", () => {
    expect(describedBy("a", "b")).toBe("a b");
    expect(describedBy("own", undefined, "hint", null, false, "error")).toBe("own hint error");
  });

  it("returns undefined when there is nothing to point at, so the attribute is omitted", () => {
    expect(describedBy()).toBeUndefined();
    expect(describedBy(undefined, null, false, "", "   ")).toBeUndefined();
  });
});

describe("errorMessages", () => {
  it("returns no messages for nothing", () => {
    expect(errorMessages(undefined)).toEqual([]);
    expect(errorMessages(null)).toEqual([]);
    expect(errorMessages("")).toEqual([]);
    expect(errorMessages([])).toEqual([]);
  });

  it("wraps a single message and keeps a list", () => {
    expect(errorMessages("Enter a time such as 05:45.")).toEqual(["Enter a time such as 05:45."]);
    expect(errorMessages(["Too long.", "Contains a line break."])).toEqual(["Too long.", "Contains a line break."]);
  });

  it("drops blank entries, which would otherwise mark the field invalid with no explanation", () => {
    expect(errorMessages(["", "  ", "Required."])).toEqual(["Required."]);
    expect(errorMessages("   ")).toEqual([]);
  });

  it("does not modify the list it is given", () => {
    const input = Object.freeze(["", "Required."]);
    expect(errorMessages(input)).toEqual(["Required."]);
    expect(input).toHaveLength(2);
  });
});

describe("FormField", () => {
  it("connects the label to the control", () => {
    const markup = field({ label: "Mosque name", id: "name" }, createElement(Input, { name: "mosqueName" }));
    expect(attribute(markup, /<label[^>]*>/, "for")).toBe("name");
    expect(attribute(markup, INPUT, "id")).toBe("name");
    expect(attribute(markup, INPUT, "name")).toBe("mosqueName");
  });

  it("generates an id when none is given, and uses the control's own id when it has one", () => {
    const generated = field({ label: "Phone" });
    const id = attribute(generated, INPUT, "id");
    expect(id).toBeTruthy();
    expect(attribute(generated, /<label[^>]*>/, "for")).toBe(id);

    const own = field({ label: "Phone" }, createElement(Input, { id: "phone" }));
    expect(attribute(own, /<label[^>]*>/, "for")).toBe("phone");
  });

  it("has no description and is not invalid when there is neither hint nor error", () => {
    const markup = field({ label: "Phone", id: "phone" });
    expect(attribute(markup, INPUT, "aria-describedby")).toBeNull();
    expect(attribute(markup, INPUT, "aria-invalid")).toBeNull();
  });

  it("describes the control with its hint", () => {
    const markup = field({ label: "Timezone", id: "tz", hint: "All times are in this zone." });
    expect(attribute(markup, INPUT, "aria-describedby")).toBe("tz-hint");
    expect(markup).toContain('<p id="tz-hint"');
    expect(attribute(markup, INPUT, "aria-invalid")).toBeNull();
  });

  it("marks the control invalid and describes it with hint then error", () => {
    const markup = field({ label: "Fajr jamaat", id: "fajr", hint: "24-hour clock.", error: "Enter a time such as 05:45." });
    expect(attribute(markup, INPUT, "aria-describedby")).toBe("fajr-hint fajr-error");
    expect(attribute(markup, INPUT, "aria-invalid")).toBe("true");
    expect(markup).toContain('id="fajr-error"');
    expect(markup).toContain("Enter a time such as 05:45.");
  });

  it("shows every message of a list", () => {
    const markup = field({ label: "Announcement", id: "a", error: ["Too long.", "Remove the link."] }, createElement(Textarea));
    expect(markup).toContain("<p>Too long.</p><p>Remove the link.</p>");
    expect(attribute(markup, /<textarea[^>]*>/, "aria-invalid")).toBe("true");
  });

  it.each([null, undefined, "", [], ["", " "]])("treats the error %j as no error", (error) => {
    const markup = field({ label: "Phone", id: "phone", error });
    expect(attribute(markup, INPUT, "aria-invalid")).toBeNull();
    expect(markup).not.toContain("phone-error");
  });

  it("keeps a description the control already had, ahead of its own", () => {
    const markup = field({ label: "Phone", id: "phone", hint: "Include the area code." }, createElement(Input, { "aria-describedby": "legal-note" }));
    expect(attribute(markup, INPUT, "aria-describedby")).toBe("legal-note phone-hint");
  });

  it("keeps an invalid state the control set itself when the field has no error", () => {
    const markup = field({ label: "Phone", id: "phone" }, createElement(Input, { invalid: true }));
    expect(attribute(markup, INPUT, "aria-invalid")).toBe("true");
  });

  it("passes required to the control, without overriding the control's own choice", () => {
    const required = field({ label: "Name", id: "n", required: true });
    expect(required).toMatch(/<input[^>]* required=""/);
    const own = field({ label: "Name", id: "n", required: true }, createElement(Input, { required: false }));
    expect(own).not.toMatch(/<input[^>]* required/);
  });

  it("marks optional fields in the label", () => {
    expect(field({ label: "Phone", id: "p", optional: true })).toContain("(optional)");
    expect(field({ label: "Phone", id: "p" })).not.toContain("(optional)");
  });

  it("wires a select the same way", () => {
    const markup = field({ label: "Timezone", id: "tz", error: "Choose a timezone." }, createElement(Select, null, createElement("option", null, "Europe/London")));
    expect(attribute(markup, /<select[^>]*>/, "id")).toBe("tz");
    expect(attribute(markup, /<select[^>]*>/, "aria-invalid")).toBe("true");
    expect(attribute(markup, /<select[^>]*>/, "aria-describedby")).toBe("tz-error");
  });
});

describe("Input", () => {
  it("is a text field by default", () => {
    expect(attribute(html(createElement(Input)), INPUT, "type")).toBe("text");
  });

  it.each(["time", "date", "number", "month"])("sets %s values in tabular figures", (type) => {
    expect(attribute(html(createElement(Input, { type })), INPUT, "class")).toContain("numerals");
  });

  it.each(["text", "email", "search", "password"])("leaves %s values in the default figures", (type) => {
    expect(attribute(html(createElement(Input, { type })), INPUT, "class")).not.toContain("numerals");
  });

  it("exposes invalid as aria-invalid", () => {
    expect(attribute(html(createElement(Input, { invalid: true })), INPUT, "aria-invalid")).toBe("true");
    expect(attribute(html(createElement(Input, { invalid: false })), INPUT, "aria-invalid")).toBeNull();
  });
});

describe("Checkbox", () => {
  it("is a real checkbox whose label is tied to it", () => {
    const markup = html(createElement(Checkbox, { id: "show", name: "show", label: "Show on the website", defaultChecked: true }));
    expect(attribute(markup, INPUT, "type")).toBe("checkbox");
    expect(attribute(markup, INPUT, "id")).toBe("show");
    expect(attribute(markup, /<label[^>]*>/, "for")).toBe("show");
    expect(markup).toMatch(/<input[^>]* checked=""/);
  });

  it("describes itself with its description, after any description it was given", () => {
    const markup = html(createElement(Checkbox, { id: "tv", label: "Show on the TV", description: "Rotates with the others.", "aria-describedby": "note" }));
    expect(attribute(markup, INPUT, "aria-describedby")).toBe("note tv-description");
    expect(markup).toContain('<p id="tv-description"');
  });

  it("renders only the box when it has no label", () => {
    const markup = html(createElement(Checkbox, { "aria-label": "Select row" }));
    expect(markup).not.toContain("<label");
    expect(attribute(markup, INPUT, "aria-label")).toBe("Select row");
    expect(attribute(markup, INPUT, "aria-describedby")).toBeNull();
  });
});

describe("Switch", () => {
  it("is a checkbox announced as a switch", () => {
    const markup = html(createElement(Switch, { id: "seconds", name: "showSeconds", label: "Show seconds" }));
    expect(attribute(markup, INPUT, "type")).toBe("checkbox");
    expect(attribute(markup, INPUT, "role")).toBe("switch");
    expect(attribute(markup, /<label[^>]*>/, "for")).toBe("seconds");
  });

  it("describes itself with its description", () => {
    const markup = html(createElement(Switch, { id: "sunrise", label: "Show sunrise", description: "Adds a row under Fajr." }));
    expect(attribute(markup, INPUT, "aria-describedby")).toBe("sunrise-description");
  });
});
