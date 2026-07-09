import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { FirebaseController } from '@/server/modules/firebase/firebase.module';
import { requireAdmin } from '@/server/core/auth.guard';

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return inject(FirebaseController) && Response.json(auth.body, { status: auth.status });
  return inject(FirebaseController).getConfig();
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return inject(FirebaseController) && Response.json(auth.body, { status: auth.status });
  return inject(FirebaseController).saveConfig(req);
}
