import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { SocialHoursController } from '@/server/modules/social-hours/social-hours.module';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  return inject(SocialHoursController).approve(req, ctx);
}
