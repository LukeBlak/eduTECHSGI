// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import { inject } from '@/server/core/container';
import { NotificationsController } from '@/server/modules/notifications/notifications.controller';

export async function POST(req: NextRequest) {
  return inject(NotificationsController).markAllRead(req);
}
