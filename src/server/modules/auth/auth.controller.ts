/**
 * Auth Controller — orquesta las peticiones HTTP y delega en AuthService.
 * Equivalente al AuthController de NestJS.
 */
import { NextRequest } from 'next/server';
import { inject, Injectable } from '@/server/core/container';
import { ok, badRequest, unauthorized, serverError } from '@/server/core/http';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthController {
  private readonly auth = inject(AuthService);

  async register(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = RegisterDto.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      }
      const result = await this.auth.register(parsed.data);
      if (!result.success) return badRequest(result.message);
      return ok(result, 201);
    } catch (e) {
      return serverError('Error al registrar', e);
    }
  }

  async login(req: NextRequest) {
    try {
      const body = await req.json();
      const parsed = LoginDto.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      }
      const result = await this.auth.login(parsed.data);
      if (!result.success) return unauthorized(result.message);
      return ok(result);
    } catch (e) {
      return serverError('Error al iniciar sesión', e);
    }
  }

  async verify(req: NextRequest) {
    try {
      const header = req.headers.get('authorization') || '';
      const token = header.replace(/^Bearer\s+/i, '').trim();
      if (!token) return ok({ valid: false, user: null });
      const payload = this.auth.verify(token);
      if (!payload) return ok({ valid: false, user: null });
      return ok({ valid: true, user: payload });
    } catch {
      return ok({ valid: false, user: null });
    }
  }
}
