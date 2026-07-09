/**
 * Auth Service — lógica de negocio de autenticación.
 * Equivalente al AuthService de NestJS.
 *
 * Migrado de Prisma a Firestore.
 */
import bcrypt from 'bcryptjs';
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import { signToken, verifyToken, type AuthPayload } from '@/server/core/jwt.util';
import { NotificationsService } from '@/server/modules/notifications/notifications.service';
import type { RegisterInput, LoginInput } from './dto/auth.dto';

/** Tipo del voluntario tal como se almacena en Firestore. */
interface VolunteerDoc {
  id: string;
  name: string;
  studentId: string;
  career: string;
  email: string;
  phone: string;
  password: string;
  role: 'admin' | 'volunteer' | 'committee_leader' | 'president' | 'vice_president';
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Comité embebido para devolver al frontend. */
interface CommitteeDoc {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AuthService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);
  private readonly notifications = inject(NotificationsService);

  async register(input: RegisterInput) {
    // 1) Verifica carnet único
    const existing = await this.fs.findOne<VolunteerDoc>('volunteers', {
      studentId: input.studentId,
    });
    if (existing) {
      return { success: false, message: 'Ya existe un voluntario con este carnet' };
    }

    // 2) Verifica que el comité exista (defense in depth)
    const committee = await this.fs.findById<CommitteeDoc>('committees', input.committeeId);
    if (!committee) {
      return { success: false, message: 'El comité seleccionado no existe' };
    }

    // 3) Hash de password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(input.password, salt);

    // 4) Crea el voluntario
    const volunteer = await this.fs.create<VolunteerDoc>('volunteers', {
      name: input.name,
      studentId: input.studentId,
      career: input.career,
      committeeId: input.committeeId,
      email: input.email || '',
      phone: input.phone || '',
      password: hashedPassword,
      role: 'volunteer',
    });

    // 5) Devuelve sin password + con comité embebido (para compat con frontend)
    const { password: _pw, ...userWithoutPassword } = volunteer;
    const userWithCommittee = {
      ...userWithoutPassword,
      committee,
    };

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
      user: userWithCommittee,
      token,
    };
  }

  async login(input: LoginInput) {
    const volunteer = await this.fs.findOne<VolunteerDoc>('volunteers', {
      studentId: input.studentId,
    });
    if (!volunteer) {
      return { success: false, message: 'Carnet o contraseña incorrectos' };
    }

    const valid = await bcrypt.compare(input.password, volunteer.password);
    if (!valid) {
      return { success: false, message: 'Carnet o contraseña incorrectos' };
    }

    // Lookup del comité (si tiene)
    let committee: CommitteeDoc | null = null;
    if (volunteer.committeeId) {
      committee = await this.fs.findById<CommitteeDoc>('committees', volunteer.committeeId);
    }

    const { password: _pw, ...userWithoutPassword } = volunteer;
    const userWithCommittee = {
      ...userWithoutPassword,
      committee,
    };

    const token = signToken({
      userId: volunteer.id,
      studentId: volunteer.studentId,
      role: volunteer.role,
      name: volunteer.name,
    });

    return {
      success: true,
      message: 'Login exitoso',
      user: userWithCommittee,
      token,
    };
  }

  verify(token: string): AuthPayload | null {
    return verifyToken(token);
  }
}
