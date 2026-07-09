import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import type { CreateCommitteeInput, UpdateCommitteeInput } from './dto/committees.dto';

@Injectable()
export class CommitteesService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);

  async list() {
    const committees = await this.db.committee.findMany({
      include: { _count: { select: { members: true, activities: true, classes: true } } },
      orderBy: { name: 'asc' },
    });
    return committees;
  }

  async getById(id: string) {
    return this.db.committee.findUnique({
      where: { id },
      include: {
        members: { orderBy: { name: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' } },
        classes: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async members(id: string) {
    return this.db.volunteer.findMany({
      where: { committeeId: id },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: CreateCommitteeInput) {
    return this.db.committee.create({
      data: {
        name: input.name,
        description: input.description ?? '',
        color: input.color ?? 'emerald',
      },
      include: { _count: { select: { members: true } } },
    });
  }

  async update(id: string, input: UpdateCommitteeInput) {
    return this.db.committee.update({
      where: { id },
      data: input as any,
      include: { _count: { select: { members: true } } },
    });
  }

  async remove(id: string) {
    // Desvincula miembros y elimina el comité
    await this.db.volunteer.updateMany({
      where: { committeeId: id },
      data: { committeeId: null },
    });
    await this.db.committee.delete({ where: { id } });
    return { success: true };
  }
}
