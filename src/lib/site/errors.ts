/**
 * What an error page can say about the error it was given.
 */

/**
 * The reference Next.js attaches to an error raised on the server (its
 * `digest`), which matches an entry in the server log; null when the value
 * carries none. The error itself is `unknown`: anything can be thrown.
 */
export function errorReference(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) return null;
  const { digest } = error;
  if (typeof digest !== "string") return null;
  const reference = digest.trim();
  return reference === "" ? null : reference;
}
