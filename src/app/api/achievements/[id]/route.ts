import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { AchievementsController } from '@/server/modules/achievements/achievements.module';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(AchievementsController).get(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return inject(AchievementsController).update(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return inject(AchievementsController).remove(req, ctx);
}
