import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Endpoint interno consumido por el PacienteClient de MS3 (ms-gestion):
 * resuelve supabase_uid -> pacienteId para "mis recetas" / "mis facturas".
 *   GET /api/internal/pacientes/by-uid/{supabaseUid}  ->  { "id": "<uuid>" } | 404
 */
export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  try {
    const paciente = await prisma.paciente.findUnique({
      where: { supabaseUid: uid },
      select: { id: true },
    });
    if (!paciente) {
      return Response.json({ error: 'paciente no encontrado' }, { status: 404 });
    }
    return Response.json({ id: paciente.id });
  } catch (err: any) {
    // Fallo inesperado (ej. BD caida): devolvemos el error COMPLETO en vez de
    // un 500 opaco, para que el consumidor (MS3) y los logs vean el detalle real.
    console.error('[ms-pacientes][by-uid] error:', err);
    return Response.json(
      {
        error: err?.message ?? String(err),
        name: err?.name,
        code: err?.code,
        stack: err?.stack,
      },
      { status: 500 },
    );
  }
}
