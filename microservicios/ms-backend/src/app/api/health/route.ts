// Endpoint de salud para los probes de Kubernetes (liveness/readiness)
// y para health checks de balanceadores en Azure.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "ms-backend",
    timestamp: new Date().toISOString(),
  });
}
