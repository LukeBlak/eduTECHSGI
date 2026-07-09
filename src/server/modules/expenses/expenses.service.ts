/**
 * Expenses Service — gestión de egresos / gastos de la asociación.
 * Completa el módulo financiero junto a Income.
 */
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateExpenseInput, UpdateExpenseInput } from './dto/expenses.dto';

@Injectable()
export class ExpensesService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async list() {
    return this.db.expense.findMany({
      include: { activity: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(input: CreateExpenseInput) {
    const created = await this.db.expense.create({
      data: {
        date: input.date ?? new Date().toISOString().slice(0, 10),
        concept: input.concept,
        amount: input.amount,
        category: input.category ?? 'general',
        paymentMethod: input.paymentMethod ?? 'efectivo',
        beneficiary: input.beneficiary ?? '',
        notes: input.notes ?? '',
        activityId: input.activityId || null,
      },
      include: { activity: true },
    });

    // Notifica a los admins sobre el nuevo egreso.
    void this.notifications.notifyAdmins({
      type: 'expense',
      title: `Egreso registrado: $${created.amount.toFixed(2)}`,
      message: `Concepto: ${created.concept}${created.beneficiary ? ` · Beneficiario: ${created.beneficiary}` : ''}.`,
      link: '/egresos',
      metadata: { expenseId: created.id, amount: created.amount, concept: created.concept },
    });

    // Realtime: refrescar dashboard financiero + lista de egresos.
    void realtime.emit(REALTIME_EVENTS.EXPENSE_CREATED, {
      expenseId: created.id,
      amount: created.amount,
      concept: created.concept,
    });
    void realtime.refreshDashboard({ reason: 'expense:created' });

    return created;
  }

  async update(id: string, input: UpdateExpenseInput) {
    const data: Record<string, unknown> = { ...input };
    if (input.activityId !== undefined) data.activityId = input.activityId || null;
    const updated = await this.db.expense.update({
      where: { id },
      data: data as any,
      include: { activity: true },
    });
    void realtime.emit(REALTIME_EVENTS.EXPENSE_UPDATED, { expenseId: id });
    void realtime.refreshDashboard({ reason: 'expense:updated' });
    return updated;
  }

  async remove(id: string) {
    await this.db.expense.delete({ where: { id } });
    void realtime.emit(REALTIME_EVENTS.EXPENSE_DELETED, { expenseId: id });
    void realtime.refreshDashboard({ reason: 'expense:deleted' });
    return { success: true };
  }

  async summary() {
    const items = await this.db.expense.findMany();
    const total = items.reduce((s, e) => s + e.amount, 0);
    const byCategory = new Map<string, number>();
    const byPaymentMethod = new Map<string, number>();
    for (const e of items) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
      byPaymentMethod.set(e.paymentMethod, (byPaymentMethod.get(e.paymentMethod) ?? 0) + e.amount);
    }
    return {
      total,
      count: items.length,
      byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })),
      byPaymentMethod: Array.from(byPaymentMethod.entries()).map(([method, amount]) => ({ method, amount })),
    };
  }
}
