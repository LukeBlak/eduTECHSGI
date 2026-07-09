import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateIncomeInput, UpdateIncomeInput } from './dto/income.dto';

@Injectable()
export class IncomeService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async list() {
    return this.db.income.findMany({ orderBy: { date: 'desc' } });
  }

  async create(input: CreateIncomeInput) {
    const created = await this.db.income.create({
      data: {
        date: input.date ?? new Date().toISOString().slice(0, 10),
        concept: input.concept,
        amount: input.amount,
        source: input.source ?? '',
        category: input.category ?? 'general',
        notes: input.notes ?? '',
      },
    });

    // Notifica a los admins sobre el nuevo ingreso.
    void this.notifications.notifyAdmins({
      type: 'income',
      title: `Ingreso registrado: $${created.amount.toFixed(2)}`,
      message: `Concepto: ${created.concept}${created.source ? ` · Origen: ${created.source}` : ''}.`,
      link: '/ingresos',
      metadata: { incomeId: created.id, amount: created.amount, concept: created.concept },
    });

    // Realtime: refrescar dashboard financiero + lista de ingresos.
    void realtime.emit(REALTIME_EVENTS.INCOME_CREATED, {
      incomeId: created.id,
      amount: created.amount,
      concept: created.concept,
    });
    void realtime.refreshDashboard({ reason: 'income:created' });

    return created;
  }

  async update(id: string, input: UpdateIncomeInput) {
    const updated = await this.db.income.update({ where: { id }, data: input as any });
    void realtime.emit(REALTIME_EVENTS.INCOME_UPDATED, { incomeId: id });
    void realtime.refreshDashboard({ reason: 'income:updated' });
    return updated;
  }

  async remove(id: string) {
    await this.db.income.delete({ where: { id } });
    void realtime.emit(REALTIME_EVENTS.INCOME_DELETED, { incomeId: id });
    void realtime.refreshDashboard({ reason: 'income:deleted' });
    return { success: true };
  }

  async summary() {
    const items = await this.db.income.findMany();
    const total = items.reduce((s, i) => s + i.amount, 0);
    const byCategory = new Map<string, number>();
    for (const i of items) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.amount);
    return {
      total,
      count: items.length,
      byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })),
    };
  }
}
