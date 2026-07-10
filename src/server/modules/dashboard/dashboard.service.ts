/**
 * Dashboard Service — agrega estadísticas para el panel principal.
 *
 * Migrado de Prisma a Firestore. El service original usaba `count()`,
 * `findMany()` con `include` anidados (committee → members → socialHours)
 * y `aggregate({ _sum })`. Todo se traduce a client-side reduces + lookups
 * manuales. Para evitar N+1, se traen `volunteers`, `socialHours`,
 * `committees`, `activities`, `activityVolunteers`, `incomes` y `expenses`
 * una sola vez y se filtran en memoria.
 */
import { inject, Injectable } from '@/server/core/container';
import { FIRESTORE_TOKEN, type FirestoreService } from '@/server/core/firestore.provider';

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

interface CommitteeDoc {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

interface ActivityDoc {
  id: string;
  title: string;
  description: string;
  objectives: string;
  impact: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  hours: number;
  hourType: 'admin' | 'field';
  capacity: number | null;
  status: 'active' | 'completed';
  completedAt: string | null;
  beneficiariesMen: number;
  beneficiariesWomen: number;
  ods: string;
  committeeId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ActivityVolunteerDoc {
  id: string;
  activityId: string;
  volunteerId: string;
  status: 'registered' | 'waitlist' | 'cancelled';
  createdAt: string;
}

interface SocialHourDoc {
  id: string;
  volunteerId: string;
  activityId: string | null;
  hours: number;
  type: 'admin' | 'field';
  date: string;
  notes: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  reviewerId: string | null;
  reviewedAt: string | null;
  rejectionReason: string;
  createdAt: string;
  updatedAt: string;
}

interface IncomeDoc {
  id: string;
  date: string;
  concept: string;
  amount: number;
  source: string;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface ExpenseDoc {
  id: string;
  date: string;
  concept: string;
  amount: number;
  category: string;
  paymentMethod: string;
  beneficiary: string;
  notes: string;
  activityId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DashboardService {
  private readonly fs = inject<FirestoreService>(FIRESTORE_TOKEN);

  async stats() {
    // 1) Conteos + colecciones completas en paralelo (un solo round-trip lógico).
    const [
      totalVolunteers,
      totalCommittees,
      totalActivities,
      totalClasses,
      socialHours,
      incomes,
      expenses,
      volunteers,
      committees,
      activities,
      activityVolunteers,
    ] = await Promise.all([
      this.fs.count('volunteers'),
      this.fs.count('committees'),
      this.fs.count('activities'),
      this.fs.count('classes'),
      this.fs.findAll<SocialHourDoc>('socialHours'),
      this.fs.findAll<IncomeDoc>('incomes'),
      this.fs.findAll<ExpenseDoc>('expenses'),
      this.fs.findAll<VolunteerDoc>('volunteers'),
      this.fs.findAll<CommitteeDoc>('committees'),
      this.fs.findAll<ActivityDoc>('activities'),
      this.fs.findAll<ActivityVolunteerDoc>('activityVolunteers'),
    ]);

    // Indexa para lookups O(1) — evita N+1.
    const committeesById = new Map(committees.map((c) => [c.id, c]));
    const socialHoursByVolunteer = new Map<string, SocialHourDoc[]>();
    for (const h of socialHours) {
      const arr = socialHoursByVolunteer.get(h.volunteerId) ?? [];
      arr.push(h);
      socialHoursByVolunteer.set(h.volunteerId, arr);
    }
    const activityVolunteersByActivity = new Map<string, number>();
    for (const av of activityVolunteers) {
      activityVolunteersByActivity.set(
        av.activityId,
        (activityVolunteersByActivity.get(av.activityId) ?? 0) + 1,
      );
    }

    // 2) Totales (agregaciones client-side, sustituyen a aggregate({ _sum })).
    const totalHours = socialHours.reduce((s, h) => s + h.hours, 0);
    const adminHours = socialHours
      .filter((h) => h.type === 'admin')
      .reduce((s, h) => s + h.hours, 0);
    const fieldHours = socialHours
      .filter((h) => h.type === 'field')
      .reduce((s, h) => s + h.hours, 0);
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalIncome - totalExpenses;

    // 3) Horas por comité + desglose admin vs campo.
    //    Reemplaza: committee.findMany({ include: { members: { include: { socialHours: true } } } })
    const hoursByCommittee = committees.map((c) => {
      const members = volunteers.filter((v) => v.committeeId === c.id);
      const allHours = members.flatMap((m) => socialHoursByVolunteer.get(m.id) ?? []);
      const admin = allHours
        .filter((h) => h.type === 'admin')
        .reduce((s, h) => s + h.hours, 0);
      const field = allHours
        .filter((h) => h.type === 'field')
        .reduce((s, h) => s + h.hours, 0);
      return {
        name: c.name,
        color: c.color,
        hours: admin + field,
        adminHours: admin,
        fieldHours: field,
        members: members.length,
      };
    });

    // 4) Top voluntarios por horas + cálculo de meta alcanzada (10h).
    //    Reemplaza: volunteer.findMany({ include: { socialHours: true, committee: true } })
    const HOUR_GOAL = 10;
    const volunteerHoursList = volunteers.map((v) => {
      const vHours = socialHoursByVolunteer.get(v.id) ?? [];
      const committee = committeesById.get(v.committeeId ?? '');
      return {
        id: v.id,
        name: v.name,
        studentId: v.studentId,
        committee: committee?.name ?? 'Sin comité',
        totalHours: vHours.reduce((s, h) => s + h.hours, 0),
        createdAt: v.createdAt ?? null,
      };
    });
    const topVolunteers = [...volunteerHoursList]
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 5);

    // KPI: voluntarios que han alcanzado la meta de 10h
    const volunteersWithGoal = volunteerHoursList.filter((v) => v.totalHours >= HOUR_GOAL).length;
    const volunteersWithHoursCount = volunteerHoursList.filter((v) => v.totalHours > 0).length;
    const avgHoursPerVolunteer = totalVolunteers > 0
      ? Math.round((totalHours / totalVolunteers) * 10) / 10
      : 0;
    const goalAchievementPct = totalVolunteers > 0
      ? Math.round((volunteersWithGoal / totalVolunteers) * 100)
      : 0;

    // KPI: crecimiento mensual de voluntarios (este mes vs mes anterior)
    const now = new Date();
    const thisMonthKey = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 7);
    const lastMonthKey = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
    const newVolunteersThisMonth = volunteerHoursList.filter(
      (v) => (v.createdAt || '').slice(0, 7) === thisMonthKey,
    ).length;
    const newVolunteersLastMonth = volunteerHoursList.filter(
      (v) => (v.createdAt || '').slice(0, 7) === lastMonthKey,
    ).length;
    const monthlyGrowthPct = newVolunteersLastMonth > 0
      ? Math.round(((newVolunteersThisMonth - newVolunteersLastMonth) / newVolunteersLastMonth) * 100)
      : newVolunteersThisMonth > 0
        ? 100
        : 0;

    // 5) KPI: beneficiarios totales a través de todas las actividades.
    //    Reemplaza: activity.findMany({ select: { beneficiariesMen, beneficiariesWomen } })
    const totalBeneficiaries = activities.reduce(
      (s, a) => s + (a.beneficiariesMen || 0) + (a.beneficiariesWomen || 0),
      0,
    );

    // 6) Actividades recientes.
    //    Reemplaza: activity.findMany({ take: 5, orderBy: createdAt desc, include: { committee, _count: { volunteers } } })
    const recentActivities = [...activities]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        startDate: a.startDate,
        endDate: a.endDate,
        committee: committeesById.get(a.committeeId ?? '')?.name ?? '—',
        volunteers: activityVolunteersByActivity.get(a.id) ?? 0,
        ods: a.ods ? a.ods.split(',').map((s) => s.trim()).filter(Boolean) : [],
      }));

    // 7) Distribución de horas por tipo (pie chart).
    const hoursByType = [
      { name: 'Administrativas', value: adminHours, color: 'graphite' },
      { name: 'De campo', value: fieldHours, color: 'emerald' },
    ].filter((x) => x.value > 0);

    // 8) Resumen financiero por mes (últimos 12 meses para toggle 3M/6M/12M).
    const months: { label: string; key: string; income: number; expense: number; balance: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7); // YYYY-MM
      const label = d.toLocaleDateString('es-SV', { month: 'short', year: '2-digit' });
      const income = incomes
        .filter((x) => (x.date || '').slice(0, 7) === key)
        .reduce((s, x) => s + x.amount, 0);
      const expense = expenses
        .filter((x) => (x.date || '').slice(0, 7) === key)
        .reduce((s, x) => s + x.amount, 0);
      months.push({ label, key, income, expense, balance: income - expense });
    }

    // 9) Tendencia mensual de horas sociales (últimos 12 meses).
    const hoursByMonth: { label: string; key: string; admin: number; field: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('es-SV', { month: 'short', year: '2-digit' });
      const monthHours = socialHours.filter((h) => (h.date || '').slice(0, 7) === key);
      const admin = monthHours.filter((h) => h.type === 'admin').reduce((s, h) => s + h.hours, 0);
      const field = monthHours.filter((h) => h.type === 'field').reduce((s, h) => s + h.hours, 0);
      hoursByMonth.push({ label, key, admin, field, total: admin + field });
    }

    // 10) Gastos por categoría.
    const expensesByCategory = new Map<string, number>();
    for (const e of expenses) {
      expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + e.amount);
    }

    // 11) Ingresos por categoría.
    const incomesByCategory = new Map<string, number>();
    for (const i of incomes) {
      incomesByCategory.set(i.category, (incomesByCategory.get(i.category) ?? 0) + i.amount);
    }

    return {
      totalVolunteers,
      totalCommittees,
      totalActivities,
      totalClasses,
      totalHours,
      adminHours,
      fieldHours,
      totalIncome,
      totalExpenses,
      balance,
      hoursByCommittee,
      hoursByType,
      topVolunteers,
      recentActivities,
      financeByMonth: months,
      hoursByMonth,
      expensesByCategory: Array.from(expensesByCategory.entries()).map(([category, amount]) => ({ category, amount })),
      incomesByCategory: Array.from(incomesByCategory.entries()).map(([category, amount]) => ({ category, amount })),
      // KPIs adicionales (Task ID 9)
      kpis: {
        avgHoursPerVolunteer,
        goalAchievementPct,
        volunteersWithGoal,
        volunteersWithHours: volunteersWithHoursCount,
        monthlyGrowthPct,
        newVolunteersThisMonth,
        newVolunteersLastMonth,
        totalBeneficiaries,
      },
    };
  }
}
