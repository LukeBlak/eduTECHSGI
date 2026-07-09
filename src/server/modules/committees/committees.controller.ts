import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, notFound, serverError } from '@/server/core/http';
import { CommitteesService } from './committees.service';
import { CreateCommitteeDto, UpdateCommitteeDto } from './dto/committees.dto';

@Injectable()
export class CommitteesController {
  private readonly service = inject(CommitteesService);

  async list() {
    try {
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar comités', e);
    }
  }

  async getById(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      const c = await this.service.getById(id);
      if (!c) return notFound('Comité no encontrado');
      return ok(c);
    } catch (e) {
      return serverError('Error al obtener comité', e);
    }
  }

  async members(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      return ok(await this.service.members(id));
    } catch (e) {
      return serverError('Error al obtener miembros', e);
    }
  }

  async create(req: NextRequest) {
    try {
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
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateCommitteeDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar comité', e);
    }
  }

  async remove(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar comité', e);
    }
  }
}
