// Force dynamic — evita que Next.js cachee esta ruta en build-time.
export const dynamic = "force-dynamic";

import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { CommitteesController } from '@/server/modules/committees/committees.module';

export async function GET(req: NextRequest) {
  return inject(CommitteesController).list(req);
}

export async function POST(req: NextRequest) {
  return inject(CommitteesController).create(req);
}
