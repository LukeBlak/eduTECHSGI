import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { AchievementsController } from '@/server/modules/achievements/achievements.module';

type Ctx = { params: Promise<{ volunteerId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(AchievementsController).byVolunteer(req, ctx);
}
