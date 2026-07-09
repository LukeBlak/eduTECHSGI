/**
 * Auth Module — registra el provider (AuthService) y el controlador.
 * Equivalente al AuthModule de NestJS (@Module({ providers, controllers })).
 */
import { provide } from '@/server/core/container';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

provide(AuthService, () => new AuthService());
provide(AuthController, () => new AuthController());

export { AuthService, AuthController };
