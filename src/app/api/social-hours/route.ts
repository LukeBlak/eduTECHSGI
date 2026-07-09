import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { SocialHoursController } from '@/server/modules/social-hours/social-hours.module';

export async function GET(req: NextRequest) {
  return inject(SocialHoursController).list(req);
}

export async function POST(req: NextRequest) {
  return inject(SocialHoursController).create(req);
}
