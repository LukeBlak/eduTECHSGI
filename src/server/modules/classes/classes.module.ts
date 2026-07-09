import { provide } from '@/server/core/container';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';

provide(ClassesService, () => new ClassesService());
provide(ClassesController, () => new ClassesController());

export { ClassesService, ClassesController };
