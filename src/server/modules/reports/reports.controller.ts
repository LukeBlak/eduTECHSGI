/**
 * Reports Controller — expone los documentos para descarga.
 * Devuelve respuestas binarias (xlsx / docx).
 *
 * Soporta filtros de rango de meses vía query params:
 *   ?startMonth=YYYY-MM&endMonth=YYYY-MM
 * para memoriaLabores, horasSociales y balanceFinanciero.
 *
 * Auth: todos los reportes requieren sesión (requireAuth). El balance
 * financiero y la memoria de labores además requieren rol privilegiado
 * (presidente/vice/líder/admin) porque incluyen datos de toda la ONG.
 */
import { NextRequest, NextResponse } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { serverError, unauthorized, forbidden } from '@/server/core/http';
import { requireAuth, requirePrivileged } from '@/server/core/auth.guard';
import { ReportsService, type PeriodFilter } from './reports.service';

@Injectable()
export class ReportsController {
  private readonly service = inject(ReportsService);

  async memoriaLabores(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const period = parsePeriod(req);
      const buffer = await this.service.memoriaLabores(period);
      const periodLabel = formatPeriodLabel(period);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Memoria-Labores-EduTECH-${periodLabel}.xlsx"`,
        },
      });
    } catch (e) {
      return serverError('Error al generar memoria de labores', e);
    }
  }

  async horasSociales(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const period = parsePeriod(req);
      const buffer = await this.service.horasSociales(period);
      const periodLabel = formatPeriodLabel(period);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Horas-Sociales-EduTECH-${periodLabel}.xlsx"`,
        },
      });
    } catch (e) {
      return serverError('Error al generar horas sociales', e);
    }
  }

  /** ODS Project — siempre requiere un projectId (la ruta es /api/reports/ods-project/[id]). */
  async odsProject(req: NextRequest, projectId: string) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { buffer, filename } = await this.service.odsProject(projectId);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Generated-Filename': filename,
        },
      });
    } catch (e) {
      return serverError('Error al generar documento ODS', e);
    }
  }

  async balanceFinanciero(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const period = parsePeriod(req);
      const buffer = await this.service.balanceFinanciero(period);
      const periodLabel = formatPeriodLabel(period);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Balance-Financiero-EduTECH-${periodLabel}.xlsx"`,
        },
      });
    } catch (e) {
      return serverError('Error al generar balance financiero', e);
    }
  }
}

/** Extrae startMonth y endMonth de los query params de la request. */
function parsePeriod(req: Request): PeriodFilter {
  try {
    const url = new URL(req.url);
    const startMonth = url.searchParams.get('startMonth') ?? undefined;
    const endMonth = url.searchParams.get('endMonth') ?? undefined;
    const period: PeriodFilter = {};
    if (startMonth && /^\d{4}-\d{2}$/.test(startMonth)) period.startMonth = startMonth;
    if (endMonth && /^\d{4}-\d{2}$/.test(endMonth)) period.endMonth = endMonth;
    return period;
  } catch {
    return {};
  }
}

/** Genera una etiqueta legible para el nombre del archivo según el período. */
function formatPeriodLabel(period: PeriodFilter): string {
  if (!period.startMonth && !period.endMonth) return '2025';
  const fmt = (m?: string) => m ? m.replace('-', '') : '';
  if (period.startMonth && period.endMonth) {
    return `${fmt(period.startMonth)}-a-${fmt(period.endMonth)}`;
  }
  return fmt(period.startMonth ?? period.endMonth) ?? '2025';
}
