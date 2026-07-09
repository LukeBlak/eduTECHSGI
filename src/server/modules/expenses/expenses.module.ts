import { provide } from '@/server/core/container';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';

provide(ExpensesService, () => new ExpensesService());
provide(ExpensesController, () => new ExpensesController());

export { ExpensesService, ExpensesController };
