import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import type { CreateNotificationInput, ListNotifFilters } from './dto/notifications.dto';
import { PRIVILEGED_ROLES } from '@/server/core/jwt.util';
import { realtime, REALTIME_EVENTS } from '@/lib/realtime-publisher';

/** Roles con acceso completo (reciben notificaciones administrativas). */
const ADMIN_ROLES = PRIVILEGED_ROLES as readonly string[];

@Injectable()
export class NotificationsService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);

  /** Lista las notificaciones de un usuario, opcionalmente solo las no leídas. */
  async listForUser(userId: string, filters: ListNotifFilters = {}) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const [items, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where: {
          userId,
          ...(filters.unreadOnly ? { read: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.db.notification.count({
        where: { userId, read: false },
      }),
    ]);
    return { items, unreadCount, total: items.length };
  }

  /** Cuenta cuántas notificaciones no leídas tiene un usuario. */
  async unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({
      where: { userId, read: false },
    });
  }

  /** Marca una notificación como leída (si pertenece al usuario). */
  async markAsRead(id: string, userId: string) {
    const notif = await this.db.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) return null;
    return this.db.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /** Marca todas las notificaciones no leídas del usuario como leídas. */
  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return result.count;
  }

  /**
   * Crea una notificación in-app para un usuario.
   * Las notificaciones son puramente visibles en el panel (sin envío por email).
   * Emite además un evento realtime dirigido al usuario para que el
   * NotificationsBell se actualice al instante (sin esperar al polling).
   */
  async create(input: CreateNotificationInput) {
    const created = await this.db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message ?? '',
        link: input.link ?? '',
        metadata: input.metadata ? JSON.stringify(input.metadata) : '',
      },
    });
    // Push realtime dirigido al usuario.
    void realtime.emitToUser(
      input.userId,
      REALTIME_EVENTS.NOTIFICATION_CREATED,
      {
        id: created.id,
        type: created.type,
        title: created.title,
        message: created.message,
        link: created.link,
        createdAt: created.createdAt,
      },
    );
    return created;
  }

  /** Notifica a varios usuarios a la vez (ej. todos los admins). */
  async createMany(inputs: CreateNotificationInput[]) {
    const results = [];
    for (const input of inputs) {
      try {
        results.push(await this.create(input));
      } catch (e) {
        console.error('[notifications] error creando notificación:', e);
      }
    }
    return results;
  }

  /**
   * Notifica a todos los usuarios con roles privilegiados (presidente,
   * vicepresidente, líder de comité, admin). Reemplaza al antiguo notifyAdmins.
   */
  async notifyAdmins(input: Omit<CreateNotificationInput, 'userId'>) {
    const admins = await this.db.volunteer.findMany({
      where: { role: { in: ADMIN_ROLES as any } },
      select: { id: true },
    });
    return this.createMany(admins.map((a) => ({ ...input, userId: a.id })));
  }

  /** Notifica a todos los miembros de un comité. */
  async notifyCommitteeMembers(committeeId: string | null | undefined, input: Omit<CreateNotificationInput, 'userId'>) {
    if (!committeeId) return [];
    const members = await this.db.volunteer.findMany({
      where: { committeeId },
      select: { id: true },
    });
    return this.createMany(members.map((m) => ({ ...input, userId: m.id })));
  }

  /** Notifica a todos los voluntarios (cualquier rol). Útil para anuncios globales. */
  async notifyAllVolunteers(input: Omit<CreateNotificationInput, 'userId'>) {
    const all = await this.db.volunteer.findMany({ select: { id: true } });
    return this.createMany(all.map((v) => ({ ...input, userId: v.id })));
  }

  /** Devuelve los destinatarios potenciales para mostrar en la UI de admin. */
  async recipientsSummary() {
    const all = await this.db.volunteer.findMany({
      select: { id: true, name: true, email: true, role: true },
    });
    return {
      total: all.length,
      admins: all.filter((v) => (ADMIN_ROLES as readonly string[]).includes(v.role)).length,
    };
  }
}
