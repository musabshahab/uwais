import { describe, expect, it } from "vitest";
import { withTimetableLock } from "./lock";

/** Resolves after the current macrotask, so anything able to run in between gets its chance. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("withTimetableLock", () => {
  it("returns what the work returns", async () => {
    await expect(withTimetableLock(async () => 42)).resolves.toBe(42);
  });

  it("runs overlapping edits one after the other, in the order they were queued", async () => {
    const events: string[] = [];
    const edit = (name: string) =>
      withTimetableLock(async () => {
        events.push(`${name} starts`);
        await nextTick();
        await nextTick();
        events.push(`${name} ends`);
        return name;
      });

    const results = await Promise.all([edit("first"), edit("second"), edit("third")]);

    expect(results).toStrictEqual(["first", "second", "third"]);
    expect(events).toStrictEqual([
      "first starts",
      "first ends",
      "second starts",
      "second ends",
      "third starts",
      "third ends",
    ]);
  });

  it("passes a failure to its caller and still runs the edits queued behind it", async () => {
    const failing = withTimetableLock(async () => {
      await nextTick();
      throw new Error("disk full");
    });
    const next = withTimetableLock(async () => "saved");

    await expect(failing).rejects.toThrow("disk full");
    await expect(next).resolves.toBe("saved");
  });

  it("does not start an edit before the one in front of it has settled", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let secondStarted = false;
    const first = withTimetableLock(() => gate);
    const second = withTimetableLock(async () => {
      secondStarted = true;
    });

    await nextTick();
    expect(secondStarted).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondStarted).toBe(true);
  });
});
