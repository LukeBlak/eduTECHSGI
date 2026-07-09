import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError, forbidden } from '@/server/core/http';
import { requirePrivileged } from '@/server/core/auth.guard';
import { ClassesService } from './classes.service';
import { CreateClassDto, UpdateClassDto } from './dto/classes.dto';

@Injectable()
export class ClassesController {
  private readonly service = inject(ClassesService);

  async list() {
    try {
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar clases', e);
    }
  }

  async getById(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      const c = await this.service.getById(id);
      if (!c) return notFound('Clase no encontrada');
      return ok(c);
    } catch (e) {
      return serverError('Error al obtener clase', e);
    }
  }

  async create(req: NextRequest) {
    try {
      // Solo presidente / vicepresidente / líder de comité / admin pueden crear
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateClassDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data), 201);
    } catch (e) {
      return serverError('Error al crear clase', e);
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateClassDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar clase', e);
    }
  }

  async remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar clase', e);
    }
  }

  /**
   * POST /api/classes/[id]/complete — finaliza la clase.
   * Solo roles privilegiados. Asigna automáticamente las horas (durationHours)
   * a cada instructor.
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
      return serverError('Error al finalizar clase', e);
    }
  }
}
