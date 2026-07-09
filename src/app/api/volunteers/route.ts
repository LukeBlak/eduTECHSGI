import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { VolunteersController } from '@/server/modules/volunteers/volunteers.module';

export async function GET() {
  return inject(VolunteersController).list();
}

export async function POST(req: NextRequest) {
  return inject(VolunteersController).create(req);
}
