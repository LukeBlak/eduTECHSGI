/**
 * Income Service — gestión de ingresos de la asociación.
 *
 * Migrado de Prisma a Firestore. Income no tiene relaciones, por lo que
 * la migración es directa (CRUD + reduce para el summary).
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateIncomeInput, UpdateIncomeInput } from './dto/income.dto';

/** Tipo del documento Income tal como se almacena en Firestore. */
interface IncomeDoc {
  id: string;
  date: string;
  concept: string;
  amount: number;
  source: string;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class IncomeService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async list() {
    return this.fs.findAll<IncomeDoc>('incomes', {
      orderBy: { field: 'date', direction: 'desc' },
    });
  }

  async create(input: CreateIncomeInput) {
    const created = await this.fs.create<IncomeDoc>('incomes', {
      date: input.date ?? new Date().toISOString().slice(0, 10),
      concept: input.concept,
      amount: input.amount,
      source: input.source ?? '',
      category: input.category ?? 'general',
      notes: input.notes ?? '',
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
    // Firestore no acepta `undefined` en los payloads — limpiar.
    const data: Record<string, unknown> = { ...input };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<IncomeDoc>('incomes', id, data);
    const updated = await this.fs.findById<IncomeDoc>('incomes', id);
    void realtime.emit(REALTIME_EVENTS.INCOME_UPDATED, { incomeId: id });
    void realtime.refreshDashboard({ reason: 'income:updated' });
    return updated;
  }

  async remove(id: string) {
    await this.fs.remove('incomes', id);
    void realtime.emit(REALTIME_EVENTS.INCOME_DELETED, { incomeId: id });
    void realtime.refreshDashboard({ reason: 'income:deleted' });
    return { success: true };
  }

  async summary() {
    const items = await this.fs.findAll<IncomeDoc>('incomes');
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
