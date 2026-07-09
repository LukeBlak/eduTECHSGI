import '@/server/app.module';

/**
 * GET /api/reports/ods-project (sin id) — ya no soportado.
 * El documento ODS siempre debe generarse a partir de un proyecto (actividad).
 * Usar: GET /api/reports/ods-project/{projectId}
 */
export async function GET() {
  return Response.json(
    {
      success: false,
      message:
        'Se requiere seleccionar un proyecto. Usa GET /api/reports/ods-project/{projectId}',
    },
    { status: 400 },
  );
}
