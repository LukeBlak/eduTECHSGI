import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ActivitiesController } from '@/server/modules/activities/activities.module';

export async function GET() {
  return inject(ActivitiesController).list();
}

export async function POST(req: NextRequest) {
  return inject(ActivitiesController).create(req);
}
