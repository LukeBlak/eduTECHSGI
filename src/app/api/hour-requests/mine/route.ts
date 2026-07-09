import { NextRequest } from 'next/server';
import '@/server/app.module';
import { inject } from '@/server/core/container';
import { HourRequestsController } from '@/server/modules/hour-requests/hour-requests.module';

export async function GET(req: NextRequest) {
  return inject(HourRequestsController).mine(req);
}
