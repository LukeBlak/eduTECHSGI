import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError, unauthorized, forbidden } from '@/server/core/http';
import { getUserFromRequest, requireAuth, requireApprover } from '@/server/core/auth.guard';
import { HourRequestsService } from './hour-requests.service';
import { CreateHourRequestDto, ReviewHourRequestDto } from './dto/hour-requests.dto';

@Injectable()
export class HourRequestsController {
  private readonly service = inject(HourRequestsService);

  /** GET /api/hour-requests — lista todas (solo líderes/presidente/vice/admin). */
  async list(req: NextRequest) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const url = new URL(req.url);
      const status = url.searchParams.get('status') || undefined;
      return ok(await this.service.list({ status }));
    } catch (e) {
      return serverError('Error al listar solicitudes de horas', e);
    }
  }

  /** GET /api/hour-requests/mine — lista las del propio usuario. */
  async mine(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.listMine(auth.user!.userId));
    } catch (e) {
      return serverError('Error al listar mis solicitudes', e);
    }
  }

  /** POST /api/hour-requests — voluntario crea solicitud. */
  async create(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateHourRequestDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data, auth.user!.userId), 201);
    } catch (e) {
      return serverError('Error al crear solicitud de horas', e);
    }
  }

  /** POST /api/hour-requests/[id]/approve — aprueba la solicitud. */
  async approve(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const parsed = ReviewHourRequestDto.safeParse(body);
      return ok(await this.service.approve(id, auth.user!.userId, parsed.data?.approvedHours));
    } catch (e) {
      return serverError('Error al aprobar solicitud', e);
    }
  }

  /** POST /api/hour-requests/[id]/reject — rechaza la solicitud. */
  async reject(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const notes = (body?.reviewNotes as string) || '';
      return ok(await this.service.reject(id, auth.user!.userId, notes));
    } catch (e) {
      return serverError('Error al rechazar solicitud', e);
    }
  }
}
