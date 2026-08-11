// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { AuthController } from '@/server/modules/auth/auth.module';

export async function GET(req: NextRequest) {
  return inject(AuthController).verify(req);
}
