import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, serverError, unauthorized } from '@/server/core/http';
import { requireAuth } from '@/server/core/auth.guard';
import { DashboardService } from './dashboard.service';

@Injectable()
export class DashboardController {
  private readonly service = inject(DashboardService);

  async stats(req: NextRequest) {
    try {
      const auth = requireAuth(req);
      if (!auth.ok) return unauthorized(auth.body.message as string);
      return ok(await this.service.stats());
    } catch (e) {
      return serverError('Error al obtener estadísticas', e);
    }
  }
}
