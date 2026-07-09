import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { FirebaseController } from '@/server/modules/firebase/firebase.module';
import { requireAdmin } from '@/server/core/auth.guard';

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return Response.json(auth.body, { status: auth.status });
  return inject(FirebaseController).push();
}
