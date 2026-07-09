/**
 * Committees Service — CRUD de comités y agregación de miembros.
 *
 * Migrado de Prisma a Firestore. Los `_count` de Prisma se reemplazan por
 * llamadas independientes a `count`, y los `include` por lookups manuales.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';
import type { CreateCommitteeInput, UpdateCommitteeInput } from './dto/committees.dto';

interface CommitteeDoc {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

interface VolunteerDoc {
  id: string;
  name: string;
  studentId: string;
  career: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityDoc {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed';
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

interface ClassDoc {
  id: string;
  title: string;
  status: 'active' | 'completed';
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
  [k: string]: unknown;
}

@Injectable()
export class CommitteesService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);

  async list() {
    const committees = await this.fs.findAll<CommitteeDoc>('committees', {
      orderBy: { field: 'name', direction: 'asc' },
    });
    return Promise.all(
      committees.map(async (c) => {
        const [members, activities, classes] = await Promise.all([
          this.fs.count('volunteers', { where: { committeeId: c.id } }),
          this.fs.count('activities', { where: { committeeId: c.id } }),
          this.fs.count('classes', { where: { committeeId: c.id } }),
        ]);
        return { ...c, _count: { members, activities, classes } };
      }),
    );
  }

  async getById(id: string) {
    const c = await this.fs.findById<CommitteeDoc>('committees', id);
    if (!c) return null;
    const [members, activities, classes] = await Promise.all([
      this.fs.findAll<VolunteerDoc>('volunteers', {
        where: { committeeId: id },
        orderBy: { field: 'name', direction: 'asc' },
      }),
      this.fs.findAll<ActivityDoc>('activities', {
        where: { committeeId: id },
        orderBy: { field: 'createdAt', direction: 'desc' },
      }),
      this.fs.findAll<ClassDoc>('classes', {
        where: { committeeId: id },
        orderBy: { field: 'createdAt', direction: 'desc' },
      }),
    ]);
    return { ...c, members, activities, classes };
  }

  async members(id: string) {
    return this.fs.findAll<VolunteerDoc>('volunteers', {
      where: { committeeId: id },
      orderBy: { field: 'name', direction: 'asc' },
    });
  }

  async create(input: CreateCommitteeInput) {
    const created = await this.fs.create<CommitteeDoc>('committees', {
      name: input.name,
      description: input.description ?? '',
      color: input.color ?? 'emerald',
    });
    const members = await this.fs.count('volunteers', { where: { committeeId: created.id } });
    return { ...created, _count: { members } };
  }

  async update(id: string, input: UpdateCommitteeInput) {
    const data: Record<string, unknown> = { ...input };
    // Firestore no acepta `undefined` en los payloads — limpiar.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    await this.fs.update<CommitteeDoc>('committees', id, data);
    const updated = await this.fs.findById<CommitteeDoc>('committees', id);
    const members = await this.fs.count('volunteers', { where: { committeeId: id } });
    return { ...updated, _count: { members } };
  }

  async remove(id: string) {
    // Desvincula miembros (committeeId = null) y elimina el comité.
    // Firestore no tiene FK cascade — la desvinculación es manual.
    await this.fs.updateMany('volunteers', { where: { committeeId: id } }, { committeeId: null });
    await this.fs.remove('committees', id);
    return { success: true };
  }
}
