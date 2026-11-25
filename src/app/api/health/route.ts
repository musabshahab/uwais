/** Liveness probe for hosting platforms and the end-to-end test runner. */
export async function GET() {
  return Response.json({ ok: true });
}
