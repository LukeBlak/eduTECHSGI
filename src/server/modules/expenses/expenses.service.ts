/**
 * Expenses Service — gestión de egresos / gastos de la asociación.
 * Completa el módulo financiero junto a Income.
 *
 * Migrado de Prisma a Firestore. El `include: { activity: true }` de Prisma
 * se reemplaza por un lookup manual de Activity por cada Expense.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';
import type { CreateExpenseInput, UpdateExpenseInput } from './dto/expenses.dto';

/** Tipo del documento Expense tal como se almacena en Firestore. */
interface ExpenseDoc {
  id: string;
  date: string;
  concept: string;
  amount: number;
  category: string;
  paymentMethod: string;
  beneficiary: string;
  notes: string;
  activityId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Activity embebida en el return shape (FK opcional, onDelete: SetNull). */
interface ActivityDoc {
  id: string;
  title: string;
  description: string;
  objectives: string;
  impact: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  hours: number;
  hourType: 'admin' | 'field';
  capacity: number | null;
  status: 'active' | 'completed';
  completedAt: string | null;
  beneficiariesMen: number;
  beneficiariesWomen: number;
  ods: string;
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExpensesService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);

  /** Embed activity si tiene activityId (preserva el shape `include: { activity: true }`). */
  private async enrichExpense(e: ExpenseDoc) {
    let activity: ActivityDoc | null = null;
    if (e.activityId) {
      activity = await this.fs.findById<ActivityDoc>('activities', e.activityId);
    }
    return { ...e, activity };
  }

  async list() {
    const items = await this.fs.findAll<ExpenseDoc>('expenses', {
      orderBy: { field: 'date', direction: 'desc' },
    });
    return Promise.all(items.map((e) => this.enrichExpense(e)));
  }

  async create(input: CreateExpenseInput) {
    const created = await this.fs.create<ExpenseDoc>('expenses', {
      date: input.date ?? new Date().toISOString().slice(0, 10),
      concept: input.concept,
      amount: input.amount,
      category: input.category ?? 'general',
      paymentMethod: input.paymentMethod ?? 'efectivo',
      beneficiary: input.beneficiary ?? '',
      notes: input.notes ?? '',
      activityId: input.activityId || null,
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

    return this.enrichExpense(created);
  }

  async update(id: string, input: UpdateExpenseInput) {
    const data: Record<string, unknown> = { ...input };
    if (input.activityId !== undefined) data.activityId = input.activityId || null;
    // Firestore no acepta `undefined` en los payloads — limpiar.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<ExpenseDoc>('expenses', id, data);
    const updated = await this.fs.findById<ExpenseDoc>('expenses', id);
    void realtime.emit(REALTIME_EVENTS.EXPENSE_UPDATED, { expenseId: id });
    void realtime.refreshDashboard({ reason: 'expense:updated' });
    return updated ? this.enrichExpense(updated) : null;
  }

  async remove(id: string) {
    await this.fs.remove('expenses', id);
    void realtime.emit(REALTIME_EVENTS.EXPENSE_DELETED, { expenseId: id });
    void realtime.refreshDashboard({ reason: 'expense:deleted' });
    return { success: true };
  }

  async summary() {
    const items = await this.fs.findAll<ExpenseDoc>('expenses');
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
