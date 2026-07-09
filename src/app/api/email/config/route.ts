import { NextRequest, NextResponse } from 'next/server';
import { inject } from '@/server/core/container';
import { EmailController } from '@/server/modules/email/email.controller';
import { requireAdmin } from '@/server/core/auth.guard';

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  return inject(EmailController).getConfig();
}

export async function PUT(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  return inject(EmailController).saveConfig(req);
}
