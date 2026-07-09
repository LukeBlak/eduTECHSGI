import { inject, Injectable } from '@/server/core/container';
import { ok, serverError } from '@/server/core/http';
import { DashboardService } from './dashboard.service';

@Injectable()
export class DashboardController {
  private readonly service = inject(DashboardService);

  async stats() {
    try {
      return ok(await this.service.stats());
    } catch (e) {
      return serverError('Error al obtener estadísticas', e);
    }
  }
}
