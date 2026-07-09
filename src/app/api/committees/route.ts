import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { CommitteesController } from '@/server/modules/committees/committees.module';

export async function GET() {
  return inject(CommitteesController).list();
}

export async function POST(req: NextRequest) {
  return inject(CommitteesController).create(req);
}
