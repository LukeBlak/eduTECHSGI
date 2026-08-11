// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { HourRequestsController } from '@/server/modules/hour-requests/hour-requests.module';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return inject(HourRequestsController).approve(req, ctx);
}
