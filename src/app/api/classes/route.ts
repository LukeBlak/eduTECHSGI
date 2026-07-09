import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { ClassesController } from '@/server/modules/classes/classes.module';

export async function GET() {
  return inject(ClassesController).list();
}

export async function POST(req: NextRequest) {
  return inject(ClassesController).create(req);
}
