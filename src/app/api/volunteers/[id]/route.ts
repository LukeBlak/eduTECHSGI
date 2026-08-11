// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { VolunteersController } from '@/server/modules/volunteers/volunteers.module';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(VolunteersController).getById(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return inject(VolunteersController).update(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return inject(VolunteersController).remove(req, ctx);
}
