import { describe, expect, it } from "vitest";
import type { ActionFailure } from "@/lib/actions/types";
import { afterEditing } from "./failures";

const REFUSED: ActionFailure = {
  ok: false,
  code: "invalid",
  error: "Title: Enter a title. 2 more fields need attention.",
  fieldErrors: { title: "Enter a title", endsOn: "The last day must not be before the first day", body: "Too long" },
};

const is =
  (...names: string[]) =>
  (field: string) =>
    names.includes(field);

describe("afterEditing", () => {
  it("leaves no failure alone", () => {
    expect(afterEditing(null, is("title"))).toBeNull();
  });

  it("keeps a failure that was not about fields", () => {
    const failed: ActionFailure = { ok: false, code: "failed", error: "The server could not be reached." };
    expect(afterEditing(failed, is("title"))).toBe(failed);
  });

  it("keeps the failure when another field was edited", () => {
    expect(afterEditing(REFUSED, is("pinned"))).toBe(REFUSED);
  });

  it("drops the message of an edited field and counts what is left", () => {
    const left = afterEditing(REFUSED, is("title"));
    expect(left?.fieldErrors).toEqual({ endsOn: REFUSED.fieldErrors?.endsOn, body: "Too long" });
    expect(left?.error).toBe("2 more fields still need correcting.");
    expect(left?.code).toBe("invalid");
  });

  it("words a single remaining field in the singular", () => {
    expect(afterEditing(REFUSED, is("title", "body"))?.error).toBe("1 more field still needs correcting.");
  });

  it("is over once every field has been edited", () => {
    expect(afterEditing(REFUSED, () => true)).toBeNull();
    expect(afterEditing(afterEditing(REFUSED, is("title", "body")), is("endsOn"))).toBeNull();
  });

  it("does not alter the failure it was given", () => {
    afterEditing(REFUSED, is("title"));
    expect(Object.keys(REFUSED.fieldErrors ?? {})).toHaveLength(3);
  });
});
