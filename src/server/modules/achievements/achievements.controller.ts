import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError, unauthorized, forbidden, notFound } from '@/server/core/http';
import { requireAuth, requirePrivileged } from '@/server/core/auth.guard';
import { AchievementsService } from './achievements.service';
import {
  CreateAchievementDto,
  UpdateAchievementDto,
  GrantAchievementDto,
  RevokeAchievementDto,
} from './dto/achievements.dto';

@Injectable()
export class AchievementsController {
  private readonly service = inject(AchievementsService);

  /** GET /api/achievements — lista logros (admins ven inactivos si ?includeInactive=1). */
  async list(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const url = new URL(req.url);
      const includeInactive =
        url.searchParams.get('includeInactive') === '1' &&
        auth.user!.role !== 'volunteer';
      return ok(await this.service.list(includeInactive));
    } catch (e) {
      return serverError('Error al listar logros', e);
    }
  }

  /** GET /api/achievements/[id] — detalle de un logro (con quiénes lo tienen). */
  async get(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      const a = await this.service.get(id);
      if (!a) return notFound('Logro no encontrado');
      return ok(a);
    } catch (e) {
      return serverError('Error al obtener logro', e);
    }
  }

  /** POST /api/achievements — crea un logro (solo privileged). */
  async create(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateAchievementDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data), 201);
    } catch (e) {
      return serverError('Error al crear logro', e);
    }
  }

  /** PUT /api/achievements/[id] — actualiza un logro (solo privileged). */
  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateAchievementDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar logro', e);
    }
  }

  /** DELETE /api/achievements/[id] — elimina un logro (solo privileged). */
  async remove(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(_req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar logro', e);
    }
  }

  /** POST /api/achievements/[id]/grant — otorga manualmente el logro a un voluntario. */
  async grant(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = GrantAchievementDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(
        await this.service.grant(id, parsed.data.volunteerId, auth.user!.userId, parsed.data.notes ?? ''),
        201,
      );
    } catch (e) {
      return serverError('Error al otorgar logro', e);
    }
  }

  /** POST /api/achievements/[id]/revoke — revoca el logro de un voluntario. */
  async revoke(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = RevokeAchievementDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.revoke(id, parsed.data.volunteerId));
    } catch (e) {
      return serverError('Error al revocar logro', e);
    }
  }

  /** GET /api/achievements/mine — logros del voluntario autenticado. */
  async mine(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.listByVolunteer(auth.user!.userId));
    } catch (e) {
      return serverError('Error al obtener tus logros', e);
    }
  }

  /** GET /api/achievements/volunteer/[volunteerId] — logros de un voluntario específico. */
  async byVolunteer(req: NextRequest, ctx: { params: Promise<{ volunteerId: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { volunteerId } = await ctx.params;
      // RBAC: voluntarios solo pueden ver sus propios logros.
      if (auth.user!.role === 'volunteer' && auth.user!.userId !== volunteerId) {
        return forbidden('No autorizado para ver logros de otro voluntario');
      }
      return ok(await this.service.listByVolunteer(volunteerId));
    } catch (e) {
      return serverError('Error al obtener logros del voluntario', e);
    }
  }

  /** GET /api/achievements/grants — todas las concesiones (vista admin). */
  async allGrants(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      return ok(await this.service.listAllGrants());
    } catch (e) {
      return serverError('Error al listar concesiones de logros', e);
    }
  }

  /** POST /api/achievements/evaluate — re-evalúa logros automáticos del voluntario autenticado. */
  async evaluateMine(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const granted = await this.service.evaluateAutoForVolunteer(auth.user!.userId);
      return ok({ granted: granted.length, items: granted });
    } catch (e) {
      return serverError('Error al evaluar logros', e);
    }
  }

  /** GET /api/achievements/leaderboard — top voluntarios por puntos de logros. */
  async leaderboard(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const url = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 100);
      const top = await this.service.leaderboard(limit);
      return ok({ top });
    } catch (e) {
      return serverError('Error al obtener ranking de logros', e);
    }
  }
}
