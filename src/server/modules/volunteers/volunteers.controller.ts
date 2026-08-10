/**
 * Volunteers Controller — expone el CRUD de voluntarios vía HTTP.
 *
 * Auth guards:
 *  - list / getById / getHours: requireAuth (cualquier usuario autenticado).
 *    Los roles privilegiados ven todos los voluntarios; el voluntario base
 *    solo puede verse a sí mismo (su propio perfil).
 *  - create / update / remove: requirePrivileged.
 *  - Role mass-assignment: solo president/admin puede crear/actualizar
 *    roles privilegiados (admin/president/vice_president/committee_leader).
 */
import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError, unauthorized, forbidden } from '@/server/core/http';
import {
  getUserFromRequest,
  requireAuth,
  requirePrivileged,
  isPrivilegedRole,
} from '@/server/core/auth.guard';
import { VolunteersService } from './volunteers.service';
import { CreateVolunteerDto, UpdateVolunteerDto } from './dto/volunteers.dto';
import type { Role } from '@/server/core/jwt.util';

/** Roles que solo president/admin pueden asignar. */
const RESTRICTED_ROLES: Role[] = ['admin', 'president', 'vice_president'];

@Injectable()
export class VolunteersController {
  private readonly service = inject(VolunteersService);

  async list(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar voluntarios', e);
    }
  }

  async getById(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      // Un voluntario base solo puede ver su propio perfil.
      if (!isPrivilegedRole(auth.user!.role) && auth.user!.userId !== id) {
        return forbidden('No tienes permisos para ver este voluntario');
      }
      const v = await this.service.getById(id);
      if (!v) return notFound('Voluntario no encontrado');
      return ok(v);
    } catch (e) {
      return serverError('Error al obtener voluntario', e);
    }
  }

  async getHours(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      const { id } = await ctx.params;
      if (!isPrivilegedRole(auth.user!.role) && auth.user!.userId !== id) {
        return forbidden('No tienes permisos para ver estas horas');
      }
      return ok(await this.service.getHours(id));
    } catch (e) {
      return serverError('Error al obtener horas', e);
    }
  }

  async create(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateVolunteerDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');

      // Role mass-assignment guard: solo president/admin puede crear
      // cuentas con roles privilegiados (admin/president/vice_president).
      if (
        RESTRICTED_ROLES.includes(parsed.data.role) &&
        !['admin', 'president'].includes(auth.user!.role)
      ) {
        return forbidden('Solo el presidente o admin puede crear cuentas con ese rol');
      }

      const created = await this.service.create(parsed.data);
      return ok(created, 201);
    } catch (e) {
      return badRequest((e as Error).message ?? 'Error al crear voluntario');
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateVolunteerDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');

      // Role mass-assignment guard: si se está cambiando el rol a uno
      // restringido, solo president/admin puede hacerlo.
      if (
        parsed.data.role &&
        RESTRICTED_ROLES.includes(parsed.data.role) &&
        !['admin', 'president'].includes(auth.user!.role)
      ) {
        return forbidden('Solo el presidente o admin puede asignar ese rol');
      }

      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar voluntario', e);
    }
  }

  async remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      // Self-protection: un president no puede eliminarse a sí mismo.
      if (auth.user!.userId === id) {
        return badRequest('No puedes eliminar tu propia cuenta');
      }
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar voluntario', e);
    }
  }
}

/** Re-exporta el helper para uso del módulo. */
export { getUserFromRequest };
