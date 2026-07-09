import { provide } from '@/server/core/container';
import { CommitteesService } from './committees.service';
import { CommitteesController } from './committees.controller';

provide(CommitteesService, () => new CommitteesService());
provide(CommitteesController, () => new CommitteesController());

export { CommitteesService, CommitteesController };
