/**
 * Auth Service — lógica de negocio de autenticación.
 * Equivalente al AuthService de NestJS.
 */
import bcrypt from 'bcryptjs';
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import { signToken, verifyToken, type AuthPayload } from '@/server/core/jwt.util';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import type { RegisterInput, LoginInput } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async register(input: RegisterInput) {
    const existing = await this.db.volunteer.findUnique({
      where: { studentId: input.studentId },
    });
    if (existing) {
      return { success: false, message: 'Ya existe un voluntario con este carnet' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(input.password, salt);

    // Verifica que el comité exista antes de registrar (defense in depth).
    const committee = await this.db.committee.findUnique({
      where: { id: input.committeeId },
    });
    if (!committee) {
      return { success: false, message: 'El comité seleccionado no existe' };
    }

    const volunteer = await this.db.volunteer.create({
      data: {
        name: input.name,
        studentId: input.studentId,
        career: input.career,
        committeeId: input.committeeId,
        email: input.email || '',
        phone: input.phone || '',
        password: hashedPassword,
        role: 'volunteer',
      },
      include: { committee: true },
    });

    const { password, ...userWithoutPassword } = volunteer;
    const token = signToken({
      userId: volunteer.id,
      studentId: volunteer.studentId,
      role: volunteer.role,
      name: volunteer.name,
    });

    // Notifica a los admins del nuevo auto-registro.
    void this.notifications.notifyAdmins({
      type: 'volunteer',
      title: `Nuevo voluntario registrado: ${volunteer.name}`,
      message: `${volunteer.name} (carnet ${volunteer.studentId}) se auto-registró en la plataforma.`,
      link: '/voluntarios',
      metadata: { volunteerId: volunteer.id, studentId: volunteer.studentId },
    });

    // Email de bienvenida al propio usuario (Creación de cuenta).
    if (volunteer.email) {
      void this.notifications.create({
        userId: volunteer.id,
        type: 'volunteer',
        title: '¡Bienvenido(a) a EduTECH ESEN!',
        message: `Hola ${volunteer.name}, tu cuenta ha sido creada exitosamente. Ya puedes inscribirte en actividades, registrar tus horas sociales y seguir tu progreso en la plataforma.`,
        link: '/dashboard',
        metadata: { welcome: true, studentId: volunteer.studentId },
      });
    }

    return {
      success: true,
      message: 'Voluntario registrado exitosamente',
      user: userWithoutPassword,
      token,
    };
  }

  async login(input: LoginInput) {
    const volunteer = await this.db.volunteer.findUnique({
      where: { studentId: input.studentId },
      include: { committee: true },
    });
    if (!volunteer) {
      return { success: false, message: 'Carnet o contraseña incorrectos' };
    }

    const valid = await bcrypt.compare(input.password, volunteer.password);
    if (!valid) {
      return { success: false, message: 'Carnet o contraseña incorrectos' };
    }

    const { password, ...userWithoutPassword } = volunteer;
    const token = signToken({
      userId: volunteer.id,
      studentId: volunteer.studentId,
      role: volunteer.role,
      name: volunteer.name,
    });

    return {
      success: true,
      message: 'Login exitoso',
      user: userWithoutPassword,
      token,
    };
  }

  verify(token: string): AuthPayload | null {
    return verifyToken(token);
  }
}
