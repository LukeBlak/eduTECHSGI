import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { CommitteesController } from '@/server/modules/committees/committees.module';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return inject(CommitteesController).getById(req, ctx);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return inject(CommitteesController).update(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return inject(CommitteesController).remove(req, ctx);
}
