import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, serverError, unauthorized } from '@/server/core/http';
import { getUserFromRequest } from '@/server/core/auth.guard';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsController {
  private readonly service = inject(NotificationsService);

  /** GET /api/notifications — lista del usuario autenticado (?unread=1 para solo no leídas) */
  async list(req: NextRequest) {
    const user = getUserFromRequest(req);
    if (!user) return unauthorized();
    try {
      const url = new URL(req.url);
      const unread = url.searchParams.get('unread') === '1';
      const limit = Number(url.searchParams.get('limit')) || 50;
      const result = await this.service.listForUser(user.userId, {
        unreadOnly: unread,
        limit,
      });
      return ok(result);
    } catch (e) {
      return serverError('Error al listar notificaciones', e);
    }
  }

  /** POST /api/notifications/[id]/read — marcar una como leída */
  async markRead(req: NextRequest, id: string) {
    const user = getUserFromRequest(req);
    if (!user) return unauthorized();
    try {
      const updated = await this.service.markAsRead(id, user.userId);
      if (!updated) return badRequest('Notificación no encontrada o no pertenece al usuario');
      return ok({ success: true, notification: updated });
    } catch (e) {
      return serverError('Error al marcar notificación', e);
    }
  }

  /** POST /api/notifications/read-all — marcar todas como leídas */
  async markAllRead(req: NextRequest) {
    const user = getUserFromRequest(req);
    if (!user) return unauthorized();
    try {
      const count = await this.service.markAllRead(user.userId);
      return ok({ success: true, marked: count });
    } catch (e) {
      return serverError('Error al marcar notificaciones', e);
    }
  }
}
