/**
 * Expenses Controller — expone el CRUD de gastos vía HTTP.
 */
import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, unauthorized, forbidden, serverError } from '@/server/core/http';
import { requireAuth, requirePrivileged } from '@/server/core/auth.guard';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expenses.dto';

@Injectable()
export class ExpensesController {
  private readonly service = inject(ExpensesService);

  async list(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.list());
    } catch (e) {
      return serverError('Error al listar gastos', e);
    }
  }

  async summary(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.summary());
    } catch (e) {
      return serverError('Error al resumir gastos', e);
    }
  }

  async create(req: NextRequest) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const body = await req.json();
      const parsed = CreateExpenseDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.create(parsed.data), 201);
    } catch (e) {
      return serverError('Error al registrar gasto', e);
    }
  }

  async update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = UpdateExpenseDto.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return ok(await this.service.update(id, parsed.data));
    } catch (e) {
      return serverError('Error al actualizar gasto', e);
    }
  }

  async remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
      const auth = requirePrivileged(req);
      if (!auth.ok) return forbidden(auth.body.message as string);
      const { id } = await ctx.params;
      return ok(await this.service.remove(id));
    } catch (e) {
      return serverError('Error al eliminar gasto', e);
    }
  }
}
