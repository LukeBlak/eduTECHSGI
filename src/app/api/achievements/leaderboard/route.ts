// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { AchievementsController } from '@/server/modules/achievements/achievements.module';

export async function GET(req: NextRequest) {
  return inject(AchievementsController).leaderboard(req);
}
