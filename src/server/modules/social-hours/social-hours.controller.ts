import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError, unauthorized, forbidden } from '@/server/core/http';
import { getUserFromRequest, requireAuth, requireApprover } from '@/server/core/auth.guard';
import { SocialHoursService } from './social-hours.service';
import { CreateSocialHourDto, UpdateSocialHourDto, ApproveSocialHourDto } from './dto/social-hours.dto';

@Injectable()
export class SocialHoursController {
  private readonly service = inject(SocialHoursService);

  async list(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const url = new URL(req.url);
      let volunteerId = url.searchParams.get('volunteerId') || undefined;
      const approvalStatus = url.searchParams.get('approvalStatus') || undefined;
      // RBAC: los voluntarios solo pueden ver SUS propias horas sociales.
      // Los roles privilegiados (admin/líder/presidente/vice) pueden listar todas
      // o filtrar por un voluntario específico.
      if (auth.user!.role === 'volunteer') {
        volunteerId = auth.user!.userId;
      }
      return ok(await this.service.list(volunteerId, { approvalStatus }));
    } catch (e) {
      return serverError('Error al listar horas sociales', e);
    }
  }

  async create(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateSocialHourDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(
        await this.service.create(parsed.data, auth.user!.role, auth.user!.userId),
        201,
      );
    } catch (e) {
      return serverError('Error al registrar hora social', e);
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateSocialHourDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar hora social', e);
    }
  }

  async remove(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(_req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar hora social', e);
    }
  }

  /** POST /api/social-hours/[id]/approve — aprueba una hora social pendiente. */
  async approve(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.approve(id, auth.user!.userId));
    } catch (e) {
      return serverError('Error al aprobar hora social', e);
    }
  }

  /** POST /api/social-hours/[id]/reject — rechaza una hora social pendiente. */
  async reject(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireApprover(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const parsed = ApproveSocialHourDto.safeParse(body);
      return ok(await this.service.reject(id, auth.user!.userId, parsed.data?.rejectionReason ?? ''));
    } catch (e) {
      return serverError('Error al rechazar hora social', e);
    }
  }
}
