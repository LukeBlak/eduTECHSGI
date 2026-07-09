import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { VolunteersController } from '@/server/modules/volunteers/volunteers.module';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(VolunteersController).getHours(req, ctx);
}
