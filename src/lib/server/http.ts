/**
 * Response helpers shared by the JSON API routes, so every endpoint answers
 * in the same shape: JSON on success, JSON on failure, never cached by
 * browsers or intermediaries, and never with a stack trace.
 */

/** Machine-readable reason of an API error. */
export type ApiErrorCode = "invalid_query" | "internal_error";

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** A sentence a developer calling the API can act on. */
    message: string;
  };
}

/** Options for a JSON response. */
export interface JsonResponseOptions {
  /** HTTP status; 200 when omitted. */
  status?: number;
  /**
   * Allow any website to read the response. Only for the endpoints that
   * serve public timetable data and take no credentials.
   */
  cors?: boolean;
}

/** Headers that open a response to scripts on other origins. */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
};

/** Builds the headers every API response carries. */
function apiHeaders(cors: boolean): Record<string, string> {
  // Prayer times and the server clock must be current; a cached copy is a wrong answer.
  return { "Cache-Control": "no-store", ...(cors ? CORS_HEADERS : {}) };
}

/** A JSON response that is never cached. */
export function jsonResponse(body: unknown, options: JsonResponseOptions = {}): Response {
  return Response.json(body, {
    status: options.status ?? 200,
    headers: apiHeaders(options.cors ?? false),
  });
}

/** A JSON error response in the shape of `ApiErrorBody`. */
export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  options: Pick<JsonResponseOptions, "cors"> = {},
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return jsonResponse(body, { status, cors: options.cors });
}

/**
 * The answer to an unexpected failure: the details go to the server log, the
 * caller gets a generic 500. Error messages can carry file paths and SQL, so
 * none of the error reaches the response.
 * @param route Path of the endpoint, for the log line.
 */
export function internalErrorResponse(
  route: string,
  error: unknown,
  options: Pick<JsonResponseOptions, "cors"> = {},
): Response {
  console.error(`[api] ${route} failed`, error);
  const message = "The server could not complete the request.";
  return errorResponse(500, "internal_error", message, options);
}

/**
 * Answers a CORS preflight for a public, read-only endpoint. Browsers send
 * one when a cross-origin caller adds a header such as `Content-Type`.
 */
export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
