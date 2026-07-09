import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ActivitiesController } from '@/server/modules/activities/activities.module';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(ActivitiesController).getById(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return inject(ActivitiesController).update(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return inject(ActivitiesController).remove(req, ctx);
}
