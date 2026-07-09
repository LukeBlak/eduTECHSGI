/**
 * Dashboard Service — agrega estadísticas para el panel principal.
 */
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';

@Injectable()
export class DashboardService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);

  async stats() {
    const [volunteers, committees, activities, classes, socialHours, incomes, expenses] = await Promise.all([
      this.db.volunteer.count(),
      this.db.committee.count(),
      this.db.activity.count(),
      this.db.class.count(),
      this.db.socialHour.findMany(),
      this.db.income.findMany(),
      this.db.expense.findMany(),
    ]);

    const totalHours = socialHours.reduce((s, h) => s + h.hours, 0);
    const adminHours = socialHours.filter((h) => h.type === 'admin').reduce((s, h) => s + h.hours, 0);
    const fieldHours = socialHours.filter((h) => h.type === 'field').reduce((s, h) => s + h.hours, 0);
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalIncome - totalExpenses;

    // Horas por comité + desglose por tipo (admin vs campo)
    const committeesWithHours = await this.db.committee.findMany({
      include: {
        members: {
          include: { socialHours: true },
        },
      },
    });
    const hoursByCommittee = committeesWithHours.map((c) => {
      const allHours = c.members.flatMap((m) => m.socialHours);
      const admin = allHours.filter((h) => h.type === 'admin').reduce((s, h) => s + h.hours, 0);
      const field = allHours.filter((h) => h.type === 'field').reduce((s, h) => s + h.hours, 0);
      return {
        name: c.name,
        color: c.color,
        hours: admin + field,
        adminHours: admin,
        fieldHours: field,
        members: c.members.length,
      };
    });

    // Top voluntarios por horas + cálculo de meta alcanzada (100h)
    const HOUR_GOAL = 100;
    const volunteersWithHours = await this.db.volunteer.findMany({
      include: { socialHours: true, committee: true },
    });
    const volunteerHoursList = volunteersWithHours.map((v) => ({
      id: v.id,
      name: v.name,
      studentId: v.studentId,
      committee: v.committee?.name ?? 'Sin comité',
      totalHours: v.socialHours.reduce((s, h) => s + h.hours, 0),
      createdAt: v.createdAt ? v.createdAt.toISOString() : null,
    }));
    const topVolunteers = [...volunteerHoursList]
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 5);

    // KPI: voluntarios que han alcanzado la meta de 100h
    const volunteersWithGoal = volunteerHoursList.filter((v) => v.totalHours >= HOUR_GOAL).length;
    const volunteersWithHoursCount = volunteerHoursList.filter((v) => v.totalHours > 0).length;
    const avgHoursPerVolunteer = volunteers > 0
      ? Math.round((totalHours / volunteers) * 10) / 10
      : 0;
    const goalAchievementPct = volunteers > 0
      ? Math.round((volunteersWithGoal / volunteers) * 100)
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

    // KPI: beneficiarios totales (hombres + mujeres) a través de todas las actividades
    const activitiesWithBeneficiaries = await this.db.activity.findMany({
      select: { beneficiariesMen: true, beneficiariesWomen: true },
    });
    const totalBeneficiaries = activitiesWithBeneficiaries.reduce(
      (s, a) => s + (a.beneficiariesMen || 0) + (a.beneficiariesWomen || 0),
      0,
    );

    // Actividades recientes
    const recentActivities = await this.db.activity.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { committee: true, _count: { select: { volunteers: true } } },
    });

    // Distribución de horas por tipo (para pie chart)
    const hoursByType = [
      { name: 'Administrativas', value: adminHours, color: 'graphite' },
      { name: 'De campo', value: fieldHours, color: 'emerald' },
    ].filter((x) => x.value > 0);

    // Resumen financiero por mes (últimos 12 meses para toggle 3M/6M/12M)
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

    // Tendencia mensual de horas sociales (últimos 12 meses) — admin dashboard
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

    // Gastos por categoría
    const expensesByCategory = new Map<string, number>();
    for (const e of expenses) {
      expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + e.amount);
    }

    // Ingresos por categoría
    const incomesByCategory = new Map<string, number>();
    for (const i of incomes) {
      incomesByCategory.set(i.category, (incomesByCategory.get(i.category) ?? 0) + i.amount);
    }

    return {
      totalVolunteers: volunteers,
      totalCommittees: committees,
      totalActivities: activities,
      totalClasses: classes,
      totalHours,
      adminHours,
      fieldHours,
      totalIncome,
      totalExpenses,
      balance,
      hoursByCommittee,
      hoursByType,
      topVolunteers,
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        title: a.title,
        startDate: a.startDate,
        endDate: a.endDate,
        committee: a.committee?.name ?? '—',
        volunteers: a._count.volunteers,
        ods: a.ods ? a.ods.split(',').map((s) => s.trim()).filter(Boolean) : [],
      })),
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
