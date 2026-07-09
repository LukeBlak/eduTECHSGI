import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError, unauthorized, forbidden } from '@/server/core/http';
import { getUserFromRequest, requireAuth, requirePrivileged } from '@/server/core/auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto, UpdateActivityDto } from './dto/activities.dto';

@Injectable()
export class ActivitiesController {
  private readonly service = inject(ActivitiesService);

  async list() {
    try {
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar actividades', e);
    }
  }

  async getById(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      const a = await this.service.getById(id);
      if (!a) return notFound('Actividad no encontrada');
      return ok(a);
    } catch (e) {
      return serverError('Error al obtener actividad', e);
    }
  }

  async create(req: NextRequest) {
    try {
      // Solo presidente / vicepresidente / líder de comité / admin pueden crear
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateActivityDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data), 201);
    } catch (e) {
      return serverError('Error al crear actividad', e);
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateActivityDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar actividad', e);
    }
  }

  async remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar actividad', e);
    }
  }

  /** POST /api/activities/[id]/subscribe — voluntario se inscribe. */
  async subscribe(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      const result = await this.service.subscribe(id, auth.user!.userId);
      return ok(result);
    } catch (e) {
      return serverError('Error al inscribirse en la actividad', e);
    }
  }

  /** POST /api/activities/[id]/unsubscribe — voluntario cancela inscripción. */
  async unsubscribe(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      const result = await this.service.unsubscribe(id, auth.user!.userId);
      return ok(result);
    } catch (e) {
      return serverError('Error al cancelar inscripción', e);
    }
  }

  /**
   * POST /api/activities/[id]/complete — finaliza la actividad.
   * Solo roles privilegiados. Asigna automáticamente las horas prometidas
   * a cada voluntario inscrito (status=registered).
   */
  async complete(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const result = await this.service.complete(id, auth.user!.userId);
      if (!result.success && !result.alreadyCompleted) {
        return notFound(result.message);
      }
      if (result.alreadyCompleted) {
        return badRequest(result.message);
      }
      return ok(result);
    } catch (e) {
      return serverError('Error al finalizar actividad', e);
    }
  }

  /** GET /api/activities/mine — actividades del usuario autenticado. */
  async mine(req: NextRequest) {
    try {
      const user = getUserFromRequest(req);
      if (!user) return unauthorized('No autorizado');
      return ok(await this.service.listForVolunteer(user.userId));
    } catch (e) {
      return serverError('Error al listar mis actividades', e);
    }
  }
}
