import { provide } from '@/server/core/container';
import { FirebaseService } from './firebase.service';
import { FirebaseController } from './firebase.controller';

provide(FirebaseService, () => new FirebaseService());
provide(FirebaseController, () => new FirebaseController());

export { FirebaseService, FirebaseController };
