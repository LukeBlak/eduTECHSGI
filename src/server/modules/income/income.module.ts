import { provide } from '@/server/core/container';
import { IncomeService } from './income.service';
import { IncomeController } from './income.controller';

provide(IncomeService, () => new IncomeService());
provide(IncomeController, () => new IncomeController());

export { IncomeService, IncomeController };
