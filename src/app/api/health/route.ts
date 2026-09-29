/** Liveness probe for uptime monitors / load balancers. */
export function GET() {
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
