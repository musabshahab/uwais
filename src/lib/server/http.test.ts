import { afterEach, describe, expect, it, vi } from "vitest";
import { corsPreflightResponse, errorResponse, internalErrorResponse, jsonResponse } from "./http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("jsonResponse", () => {
  it("answers 200 JSON that must not be cached, closed to other origins by default", async () => {
    const response = jsonResponse({ hello: "world" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toEqual({ hello: "world" });
  });

  it("opens the response to every origin only when asked", () => {
    expect(jsonResponse({}, { cors: true }).headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("errorResponse", () => {
  it("wraps the code and message in the error envelope", async () => {
    const response = errorResponse(400, "invalid_query", "Bad month.", { cors: true });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      error: { code: "invalid_query", message: "Bad month." },
    });
  });
});

describe("internalErrorResponse", () => {
  it("logs the failure and tells the caller nothing about it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("SQLITE_CANTOPEN: /srv/secret/path.db");

    const response = internalErrorResponse("/api/display", failure);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal_error", message: "The server could not complete the request." },
    });
    expect(text).not.toContain("SQLITE");
    expect(text).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("[api] /api/display failed", failure);
  });
});

describe("corsPreflightResponse", () => {
  it("allows simple read requests from anywhere", () => {
    const response = corsPreflightResponse();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
  });
});
