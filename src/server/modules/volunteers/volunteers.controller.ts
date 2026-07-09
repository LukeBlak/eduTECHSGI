/**
 * Volunteers Controller — expone el CRUD de voluntarios vía HTTP.
 */
import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError } from '@/server/core/http';
import { VolunteersService } from './volunteers.service';
import { CreateVolunteerDto, UpdateVolunteerDto } from './dto/volunteers.dto';

@Injectable()
export class VolunteersController {
  private readonly service = inject(VolunteersService);

  async list() {
    try {
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar voluntarios', e);
    }
  }

  async getById(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      const v = await this.service.getById(id);
      if (!v) return notFound('Voluntario no encontrado');
      return ok(v);
    } catch (e) {
      return serverError('Error al obtener voluntario', e);
    }
  }

  async getHours(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      return ok(await this.service.getHours(id));
    } catch (e) {
      return serverError('Error al obtener horas', e);
    }
  }

  async create(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = CreateVolunteerDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      const created = await this.service.create(parsed.data);
      return ok(created, 201);
    } catch (e) {
      return badRequest((e as Error).message ?? 'Error al crear voluntario');
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateVolunteerDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar voluntario', e);
    }
  }

  async remove(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar voluntario', e);
    }
  }
}
