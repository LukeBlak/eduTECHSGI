import { NextRequest } from 'next/server';
import { inject } from '@/server/core/container';
import { NotificationsController } from '@/server/modules/notifications/notifications.controller';

export async function POST(req: NextRequest) {
  return inject(NotificationsController).markAllRead(req);
}
