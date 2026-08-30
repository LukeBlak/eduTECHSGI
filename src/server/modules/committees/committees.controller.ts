import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError, forbidden, unauthorized } from '@/server/core/http';
import { requireAuth, requirePrivileged } from '@/server/core/auth.guard';
import { sanitizeVolunteer } from '@/server/core/sanitize';
import { CommitteesService } from './committees.service';
import { CreateCommitteeDto, UpdateCommitteeDto } from './dto/committees.dto';

@Injectable()
export class CommitteesController {
  private readonly service = inject(CommitteesService);

  async list(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar comités', e);
    }
  }

  /**
   * Lista PÚBLICA de comités (solo id/name/color). No requiere auth.
   * Usada por el formulario de registro antes de que el volunteer tenga
   * sesión. No expone datos sensibles (miembros, actividades, clases).
   */
  async publicList() {
    try {
      return ok(await this.service.listPublic());
    } catch (e) {
      return serverError('Error al listar comités públicos', e);
    }
  }

  async getById(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      const c = await this.service.getById(id);
      if (!c) return notFound('Comité no encontrado');
      return ok(c);
    } catch (e) {
      return serverError('Error al obtener comité', e);
    }
  }

  async members(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      const members = await this.service.members(id);
      // Sanitizar: nunca exponer hashes de password.
      return ok(members.map((m) => sanitizeVolunteer(m)!));
    } catch (e) {
      return serverError('Error al obtener miembros', e);
    }
  }

  async create(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateCommitteeDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data), 201);
    } catch (e) {
      return serverError('Error al crear comité', e);
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateCommitteeDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar comité', e);
    }
  }

  async remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar comité', e);
    }
  }
}
