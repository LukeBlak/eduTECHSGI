import { provide } from '@/server/core/container';
import { VolunteersService } from './volunteers.service';
import { VolunteersController } from './volunteers.controller';

provide(VolunteersService, () => new VolunteersService());
provide(VolunteersController, () => new VolunteersController());

export { VolunteersService, VolunteersController };
