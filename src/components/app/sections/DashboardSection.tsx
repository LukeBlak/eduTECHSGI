"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Network,
  CalendarDays,
  GraduationCap,
  Clock,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  Trophy,
  Activity as ActivityIcon,
  PieChart as PieIcon,
  Briefcase,
  MapPin,
  UserCircle,
  Sparkles,
  Target,
  HeartHandshake,
  Gauge,
  UserPlus,
  Printer,
  Heart,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import {
  dashboardApi,
  volunteersApi,
  committeesApi,
  formatCurrency,
  formatDate,
  type DashboardData,
  type VolunteerHours,
  type Committee,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { StatCard, SectionHeader, EmptyState, KpiCard } from "../Shared";
import { BrandLogo } from "../BrandLogo";
import { useRealtimeRefresh } from "../realtime/RealtimeProvider";

// Paleta oficial EduTECH ESEN (turquesa / cian)
const BAR_COLORS: Record<string, string> = {
  emerald: "#10616D", // Caribbean Current (mantenemos la key por compatibilidad)
  turquoise: "#10616D",
  cyan: "#00B0B7",
  electric: "#5FEAFF",
  graphite: "#6d747c",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
};

const EXPENSE_COLORS = ["#10616D", "#00B0B7", "#5FEAFF", "#0ea5e9", "#8b5cf6", "#6d747c", "#f43f5e", "#fb923c"];

export function DashboardSection() {
  const { user } = useAuthStore();
  const isVolunteer = user?.role === "volunteer";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeView, setFinanceView] = useState<"line" | "bar">("line");
  const [financeRange, setFinanceRange] = useState<"3m" | "6m" | "12m" | "all">("6m");

  // Volunteer personal dashboard state
  const [myHours, setMyHours] = useState<VolunteerHours | null>(null);
  const [myCommittee, setMyCommittee] = useState<Committee | null>(null);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState<string | null>(null);

  // Refs con los valores actuales del usuario, para que las funciones de carga
  // sean estables (no cambien de identidad) y puedan usarse en suscripciones
  // realtime sin re-suscribir constantemente.
  const userIdRef = useRef(user?.id);
  const userCommitteeRef = useRef(user?.committeeId);
  const isVolunteerRef = useRef(isVolunteer);
  useEffect(() => {
    userIdRef.current = user?.id;
    userCommitteeRef.current = user?.committeeId;
    isVolunteerRef.current = isVolunteer;
  }, [user?.id, user?.committeeId, isVolunteer]);

  // Carga del dashboard de admin (estable: sin deps).
  const loadAdmin = useCallback(() => {
    setLoading(true);
    dashboardApi
      .stats()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => setLoading(false));
  }, []);

  // Carga del dashboard personal del voluntario (estable: lee de refs).
  const loadVolunteer = useCallback(() => {
    const id = userIdRef.current;
    const committeeId = userCommitteeRef.current;
    if (!id) return;
    setMyLoading(true);
    Promise.all([
      volunteersApi.hours(id),
      committeesApi.list(),
    ])
      .then(([h, cs]) => {
        setMyHours(h);
        setMyCommittee(cs.find((c) => c.id === committeeId) ?? null);
        setMyError(null);
      })
      .catch((e: unknown) => {
        setMyError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => setMyLoading(false));
  }, []);

  useEffect(() => {
    if (isVolunteer && user?.id) {
      loadVolunteer();
    } else if (!isVolunteer) {
      loadAdmin();
    }
  }, [isVolunteer, user?.id, user?.committeeId, loadVolunteer, loadAdmin]);

  // ─── Realtime: refrescar automáticamente cuando cambian datos relevantes ───
  // El backend emite estos eventos al mutar (crear/editar/eliminar) actividades,
  // horas sociales, ingresos, egresos, voluntarios. También emite un
  // `dashboard:refresh` global. Usamos debounce de 400ms para agrupar ráfagas.
  const refreshFn = useCallback(() => {
    if (isVolunteerRef.current) loadVolunteer();
    else loadAdmin();
  }, [loadAdmin, loadVolunteer]);

  useRealtimeRefresh(
    [
      "dashboard:refresh",
      "activity:created",
      "activity:updated",
      "activity:deleted",
      "activity:subscribed",
      "activity:unsubscribed",
      "social-hour:created",
      "social-hour:approved",
      "social-hour:rejected",
      "income:created",
      "income:updated",
      "income:deleted",
      "expense:created",
      "expense:updated",
      "expense:deleted",
      "volunteer:created",
      "volunteer:updated",
      "volunteer:deleted",
    ],
    refreshFn,
    400,
  );

  if (isVolunteer) {
    if (myLoading) return <DashboardSkeleton />;
    if (myError || !myHours) {
      return (
        <EmptyState
          icon={ActivityIcon}
          title="No se pudo cargar tu dashboard"
          description={myError || "Inténtelo de nuevo más tarde"}
        />
      );
    }
    return <VolunteerDashboard hours={myHours} userName={user?.name || ""} committee={myCommittee} />;
  }

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No se pudo cargar el dashboard"
        description={error || "Inténtelo de nuevo más tarde"}
      />
    );
  }

  const maxVolunteerHours = Math.max(...data.topVolunteers.map((v) => v.totalHours), 1);
  const balancePositive = data.balance >= 0;
  const maxCatExpense = Math.max(...data.expensesByCategory.map((c) => c.amount), 1);
  const maxCatIncome = Math.max(...data.incomesByCategory.map((c) => c.amount), 1);

  // Slice finance data according to selected range
  const financeData = (() => {
    const all = data.financeByMonth;
    if (financeRange === "all") return all;
    const n = financeRange === "3m" ? 3 : financeRange === "6m" ? 6 : 12;
    return all.slice(-n);
  })();
  const financeHasData = financeData.some((m) => m.income !== 0 || m.expense !== 0);

  // Stacked committee hours data — filter out committees with 0 hours
  const stackedCommitteeData = data.hoursByCommittee.filter((c) => c.hours > 0);
  const maxCommitteeHours = Math.max(...stackedCommitteeData.map((c) => c.hours), 1);

  // KPI values
  const k = data.kpis;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Dashboard"
        description="Resumen general de la asociación EduTECH ESEN"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="size-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
        }
      />

      {/* Print-only header */}
      <div data-print-header className="mb-6">
        <div className="flex items-center justify-between border-b-2 border-primary pb-3 mb-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={44} />
            <div>
              <h1 className="text-xl font-bold">EduTECH ESEN</h1>
              <p className="text-xs text-muted-foreground">Reporte de Dashboard · {new Date().toLocaleDateString("es-SV", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Generado por: {user?.name || "Administrador"}</p>
            <p className="tabular-nums">{new Date().toLocaleTimeString("es-SV")}</p>
          </div>
        </div>
      </div>

      {/* Hero banner with greeting + snapshot */}
      <Card className="relative overflow-hidden ring-1 ring-primary/20">
        <div className="absolute inset-0 bg-brand-gradient-soft pointer-events-none" />
        <div className="absolute -top-8 -right-8 size-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 size-32 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />
        <CardContent className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                <Sparkles className="size-3" />
                Panel administrativo
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Date().toLocaleDateString("es-SV", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
              {greeting()}, Administrador
            </h3>
            <p className="text-sm text-muted-foreground">
              {balancePositive ? (
                <>
                  El balance de la asociación es positivo{" "}
                  <span className="font-semibold text-primary">
                    {formatCurrency(data.balance)}
                  </span>{" "}
                  · {data.totalHours}h registradas · {data.totalActivities} actividades activas
                </>
              ) : (
                <>
                  Atención: los egresos superan a los ingresos por{" "}
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    {formatCurrency(Math.abs(data.balance))}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4 sm:flex sm:items-center sm:gap-5">
            <HeroMetric label="Voluntarios" value={data.totalVolunteers} accent="emerald" />
            <HeroMetric label="Horas" value={`${data.totalHours}h`} accent="graphite" />
            <HeroMetric
              label="Balance"
              value={formatCurrency(data.balance)}
              accent={balancePositive ? "emerald" : "rose"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Voluntarios"
          value={data.totalVolunteers}
          icon={Users}
          accent="emerald"
          description="Registrados en la asociación"
        />
        <StatCard
          title="Comités"
          value={data.totalCommittees}
          icon={Network}
          accent="teal"
          description="Activos actualmente"
        />
        <StatCard
          title="Actividades"
          value={data.totalActivities}
          icon={CalendarDays}
          accent="sky"
          description="Proyectos y eventos"
        />
        <StatCard
          title="Clases impartidas"
          value={data.totalClasses}
          icon={GraduationCap}
          accent="violet"
          description="En escuelas y comunidades"
        />
        <StatCard
          title="Horas sociales"
          value={data.totalHours}
          icon={Clock}
          accent="graphite"
          description={`${data.adminHours} admin · ${data.fieldHours} campo`}
        />
        <StatCard
          title="Balance"
          value={formatCurrency(data.balance)}
          icon={Scale}
          accent={balancePositive ? "emerald" : "rose"}
          description={
            balancePositive
              ? `${formatCurrency(data.totalIncome)} − ${formatCurrency(data.totalExpenses)}`
              : `Egresos superan a ingresos`
          }
        />
      </div>

      {/* Finance mini-summary row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="ring-1 ring-primary/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <CardContent className="relative p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Ingresos totales</p>
              <p className="text-xl font-bold tracking-tight text-primary">
                {formatCurrency(data.totalIncome)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="ring-1 ring-rose-500/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none" />
          <CardContent className="relative p-5 flex items-center gap-4">
            <div className="size-11 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <TrendingDown className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Egresos totales</p>
              <p className="text-xl font-bold tracking-tight text-rose-700 dark:text-rose-400">
                {formatCurrency(data.totalExpenses)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className={`ring-1 overflow-hidden ${balancePositive ? "ring-secondary/20" : "ring-graphite-500/20"}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent pointer-events-none" />
          <CardContent className="relative p-5 flex items-center gap-4">
            <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${balancePositive ? "bg-secondary/15 text-secondary-foreground dark:text-secondary" : "bg-graphite-500/10 text-graphite-600 dark:text-graphite-400"}`}>
              <Scale className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Balance neto</p>
              <p className={`text-xl font-bold tracking-tight ${balancePositive ? "text-secondary-foreground dark:text-secondary" : "text-graphite-700 dark:text-graphite-400"}`}>
                {formatCurrency(data.balance)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI row — derived metrics (Task ID 9) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Promedio horas/voluntario"
          value={`${k.avgHoursPerVolunteer}h`}
          icon={Gauge}
          accent="emerald"
          description={`${k.volunteersWithHours} de ${data.totalVolunteers} con horas`}
          progress={{
            value: Math.min(100, (k.avgHoursPerVolunteer / 100) * 100),
            label: `Meta: 100h por voluntario`,
          }}
        />
        <KpiCard
          title="Meta 100h alcanzada"
          value={`${k.goalAchievementPct}%`}
          icon={Target}
          accent="graphite"
          description={`${k.volunteersWithGoal} voluntario(s) completaron la meta`}
          progress={{
            value: k.goalAchievementPct,
            label: `${k.volunteersWithGoal}/${data.totalVolunteers} voluntarios`,
          }}
        />
        <KpiCard
          title="Crecimiento mensual"
          value={`${k.monthlyGrowthPct >= 0 ? "+" : ""}${k.monthlyGrowthPct}%`}
          icon={UserPlus}
          accent={k.monthlyGrowthPct >= 0 ? "sky" : "rose"}
          description={`${k.newVolunteersThisMonth} nuevos este mes`}
          trend={{
            value: k.monthlyGrowthPct,
            label: `vs ${k.newVolunteersLastMonth} el mes pasado`,
          }}
        />
        <KpiCard
          title="Beneficiarios totales"
          value={k.totalBeneficiaries}
          icon={HeartHandshake}
          accent="violet"
          description={`A través de ${data.totalActivities} actividad(es)`}
        />
      </div>

      {/* Charts row 1: hours by committee + top volunteers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hours by committee — stacked admin vs field */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-primary" />
                Horas por comité y tipo
              </CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-graphite-500" />
                  <span className="text-muted-foreground">Admin</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" />
                  <span className="text-muted-foreground">Campo</span>
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stackedCommitteeData.length === 0 ? (
              <EmptyState
                icon={Network}
                title="Sin datos"
                description="No hay comités con horas registradas"
              />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stackedCommitteeData}
                    margin={{ top: 8, right: 8, bottom: 8, left: -16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(16, 97, 109, 0.08)" }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        `${value} h`,
                        name === "adminHours" ? "Administrativas" : "De campo",
                      ]}
                    />
                    <Bar dataKey="adminHours" stackId="a" fill="#6d747c" radius={[0, 0, 0, 0]} maxBarSize={64} name="adminHours" />
                    <Bar dataKey="fieldHours" stackId="a" fill="#10616D" radius={[6, 6, 0, 0]} maxBarSize={64} name="fieldHours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top volunteers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-graphite-500" />
              Top voluntarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topVolunteers.length === 0 ? (
              <EmptyState icon={Users} title="Sin voluntarios" />
            ) : (
              <ul className="space-y-3 max-h-72 overflow-y-auto scroll-thin pr-1">
                {data.topVolunteers.map((v, i) => (
                  <li key={v.id} className="space-y-1 group">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-transform group-hover:scale-110 ${
                            i === 0
                              ? "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300"
                              : i === 1
                              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              : i === 2
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{v.name}</p>
                          <p className="text-xs text-muted-foreground truncate tabular-nums">
                            {v.committee} · {v.studentId}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {v.totalHours}h
                      </span>
                    </div>
                    <Progress
                      value={(v.totalHours / maxVolunteerHours) * 100}
                      className="h-1.5"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hours by type — pie chart */}
      {data.hoursByType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="size-4 text-primary" />
              Distribución de horas por tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.hoursByType}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {data.hoursByType.map((entry, index) => (
                        <Cell
                          key={`pie-cell-${index}`}
                          fill={BAR_COLORS[entry.color] || "#10616D"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [`${value} h`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {data.hoursByType.map((h) => {
                  const pct = data.totalHours > 0 ? Math.round((h.value / data.totalHours) * 100) : 0;
                  return (
                    <div key={h.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-3 rounded-full"
                            style={{ background: BAR_COLORS[h.color] || "#10616D" }}
                          />
                          {h.name}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {h.value}h <span className="text-muted-foreground text-xs">({pct}%)</span>
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{data.totalHours}h</span> registradas en el sistema
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row 2: monthly finance + expenses by category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4 text-primary" />
                Flujo financiero
              </CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Range toggle */}
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted text-xs">
                  {([
                    { id: "3m", label: "3M" },
                    { id: "6m", label: "6M" },
                    { id: "12m", label: "12M" },
                    { id: "all", label: "Todo" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFinanceRange(opt.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        financeRange === opt.id
                          ? "bg-background shadow-sm text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* View toggle */}
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted text-xs">
                  <button
                    type="button"
                    onClick={() => setFinanceView("line")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${financeView === "line" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Líneas
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinanceView("bar")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${financeView === "bar" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Barras
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!financeHasData ? (
              <EmptyState
                icon={Wallet}
                title="Sin movimientos"
                description={`No hay ingresos ni egresos en el rango seleccionado (${financeRange === "all" ? "12 meses" : financeRange === "12m" ? "12 meses" : financeRange === "6m" ? "6 meses" : "3 meses"}). Prueba con "Todo" para ver todo el histórico.`}
              />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {financeView === "line" ? (
                    <LineChart
                      data={financeData}
                      margin={{ top: 8, right: 8, bottom: 8, left: -8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [
                          formatCurrency(value),
                          name === "income" ? "Ingresos" : "Egresos",
                        ]}
                      />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs">
                            {value === "income" ? "Ingresos" : "Egresos"}
                          </span>
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke="#10616D"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#10616D" }}
                        activeDot={{ r: 5 }}
                        name="income"
                      />
                      <Line
                        type="monotone"
                        dataKey="expense"
                        stroke="#f43f5e"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#f43f5e" }}
                        activeDot={{ r: 5 }}
                        name="expense"
                      />
                    </LineChart>
                  ) : (
                    <BarChart
                      data={financeData}
                      margin={{ top: 8, right: 8, bottom: 8, left: -8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [
                          formatCurrency(value),
                          name === "income" ? "Ingresos" : "Egresos",
                        ]}
                      />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs">
                            {value === "income" ? "Ingresos" : "Egresos"}
                          </span>
                        )}
                      />
                      <Bar dataKey="income" fill="#10616D" radius={[4, 4, 0, 0]} maxBarSize={36} name="income" />
                      <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} name="expense" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expenses by category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="size-4 text-rose-500" />
              Egresos por categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <EmptyState icon={TrendingDown} title="Sin egresos" />
            ) : (
              <ul className="space-y-2.5 max-h-72 overflow-y-auto scroll-thin pr-1">
                {data.expensesByCategory
                  .slice()
                  .sort((a, b) => b.amount - a.amount)
                  .map((c, i) => (
                    <li key={c.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}
                          />
                          <span className="truncate">{c.category || "Sin categoría"}</span>
                        </span>
                        <span className="font-semibold tabular-nums text-rose-700 dark:text-rose-400 shrink-0">
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(c.amount / maxCatExpense) * 100}%`,
                            background: EXPENSE_COLORS[i % EXPENSE_COLORS.length],
                          }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income by category */}
      {data.incomesByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4 text-primary" />
              Ingresos por categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.incomesByCategory
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .map((c) => (
                  <li key={c.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium">{c.category || "Sin categoría"}</span>
                      <span className="tabular-nums text-primary">
                        {formatCurrency(c.amount)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gradient rounded-full transition-all"
                        style={{ width: `${(c.amount / maxCatIncome) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-primary" />
            Actividades recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivities.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Sin actividades recientes" />
          ) : (
            <ul className="divide-y">
              {data.recentActivities.map((a) => (
                <li
                  key={a.id}
                  className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate group-hover:text-primary transition-colors">{a.title}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(a.startDate)}
                      {a.endDate && a.endDate !== a.startDate
                        ? ` — ${formatDate(a.endDate)}`
                        : ""}{" "}
                      · {a.volunteers} voluntario(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {a.committee}
                    </Badge>
                    {a.ods.slice(0, 2).map((o) => (
                      <Badge
                        key={o}
                        variant="outline"
                        className="text-[10px] truncate max-w-[160px]"
                      >
                        {o}
                      </Badge>
                    ))}
                    {a.ods.length > 2 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{a.ods.length - 2}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Monthly social hours trend — last 12 months */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-graphite-500" />
              Tendencia mensual de horas sociales
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-graphite-500" />
                <span className="text-muted-foreground">Admin</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" />
                <span className="text-muted-foreground">Campo</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-secondary" />
                <span className="text-muted-foreground">Total</span>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.hoursByMonth.every((m) => m.total === 0) ? (
            <EmptyState
              icon={Clock}
              title="Sin registros en el último año"
              description="No se han registrado horas sociales en los últimos 12 meses."
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.hoursByMonth}
                  margin={{ top: 8, right: 16, bottom: 8, left: -8 }}
                >
                  <defs>
                    <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10616D" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10616D" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      `${value} h`,
                      name === "admin" ? "Administrativas" : name === "field" ? "De campo" : "Total",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#00B0B7"
                    strokeWidth={3}
                    dot={{ r: 3, fill: "#00B0B7" }}
                    activeDot={{ r: 6 }}
                    name="total"
                  />
                  <Line
                    type="monotone"
                    dataKey="field"
                    stroke="#10616D"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 2, fill: "#10616D" }}
                    name="field"
                  />
                  <Line
                    type="monotone"
                    dataKey="admin"
                    stroke="#6d747c"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 2, fill: "#6d747c" }}
                    name="admin"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insights panel — smart recommendations based on the loaded data */}
      <InsightsPanel data={data} />
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Dashboard" description="Cargando..." />
      {/* Hero skeleton */}
      <Card className="relative overflow-hidden ring-1 ring-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-16" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-5 flex items-start gap-4">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="size-10 rounded-xl" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-1.5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   Volunteer personal dashboard — view for volunteer role.
   ============================================================ */

const HOUR_GOAL = 100;

function VolunteerDashboard({
  hours,
  userName,
  committee,
}: {
  hours: VolunteerHours;
  userName: string;
  committee: Committee | null;
}) {
  const firstName = userName.split(" ")[0] || userName;
  const hoursPct = Math.min(100, (hours.totalHours / HOUR_GOAL) * 100);
  const remaining = Math.max(0, HOUR_GOAL - hours.totalHours);
  const recentRecords = [...hours.records]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 6);
  const maxActHours = Math.max(...hours.byActivity.map((a) => a.hours), 1);

  // Pie data for hours by type
  const pieData = [
    { name: "Administrativas", value: hours.adminHours, color: "graphite" },
    { name: "De campo", value: hours.fieldHours, color: "emerald" },
  ].filter((d) => d.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Mi Dashboard"
        description="Tu progreso personal como voluntario de EduTECH ESEN"
      />

      {/* Hero banner */}
      <Card className="relative overflow-hidden ring-1 ring-primary/30">
        <div className="absolute inset-0 bg-brand-gradient-soft pointer-events-none" />
        <CardContent className="relative p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="size-16 rounded-2xl bg-brand-gradient text-white flex items-center justify-center shrink-0 shadow-md">
            <UserCircle className="size-9" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary uppercase tracking-wide">
              ¡Hola, {firstName}!
            </p>
            <h3 className="text-xl font-bold leading-tight">
              {hours.totalHours >= HOUR_GOAL
                ? "🎉 ¡Felicidades! Has alcanzado tu meta de horas sociales"
                : `Te faltan ${remaining}h para tu meta de ${HOUR_GOAL}h`}
            </h3>
            {committee && (
              <Badge
                variant="secondary"
                className="mt-1.5 bg-primary/15 text-primary"
              >
                <Sparkles className="size-3" />
                {committee.name}
              </Badge>
            )}
          </div>
          <div className="text-center md:text-right shrink-0">
            <p className="text-xs text-muted-foreground">Progreso</p>
            <p className="text-3xl font-bold text-primary tabular-nums">
              {Math.round(hoursPct)}%
            </p>
          </div>
        </CardContent>
        <div className="px-6 pb-4">
          <Progress value={hoursPct} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-1.5">
            {hours.totalHours}h de {HOUR_GOAL}h objetivo
          </p>
        </div>
      </Card>

      {/* Personal stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Mis horas totales"
          value={`${hours.totalHours}h`}
          icon={Clock}
          accent="emerald"
          description={`${hours.records.length} registro(s)`}
        />
        <StatCard
          title="Horas admin"
          value={`${hours.adminHours}h`}
          icon={Briefcase}
          accent="graphite"
          description="Trabajo de oficina"
        />
        <StatCard
          title="Horas de campo"
          value={`${hours.fieldHours}h`}
          icon={MapPin}
          accent="sky"
          description="Actividades externas"
        />
        <StatCard
          title="Actividades"
          value={hours.byActivity.length}
          icon={CalendarDays}
          accent="violet"
          description="En las que participas"
        />
      </div>

      {/* Charts row: hours by activity + hours by type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-primary" />
              Mis horas por actividad
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hours.byActivity.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Sin actividades"
                description="Aún no has participado en actividades."
              />
            ) : (
              <ul className="space-y-3 max-h-72 overflow-y-auto scroll-thin pr-1">
                {hours.byActivity.map((a, i) => {
                  const isField = a.type === "field";
                  return (
                    <li key={a.activityId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isField
                                ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                                : "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {isField ? "Campo" : "Administrativa"}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {a.hours}h
                        </span>
                      </div>
                      <Progress
                        value={(a.hours / maxActHours) * 100}
                        className={`h-1.5 ${isField ? "[&>div]:bg-sky-500" : "[&>div]:bg-graphite-500"}`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="size-4 text-primary" />
              Distribución por tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <EmptyState icon={Clock} title="Sin horas" />
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                      >
                        {pieData.map((entry, index) => (
                          <Cell
                            key={`vpie-cell-${index}`}
                            fill={BAR_COLORS[entry.color] || "#10616D"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [`${value}h`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-2 mt-3">
                  {pieData.map((h) => {
                    const pct = hours.totalHours > 0 ? Math.round((h.value / hours.totalHours) * 100) : 0;
                    return (
                      <div key={h.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ background: BAR_COLORS[h.color] || "#10616D" }}
                          />
                          {h.name}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {h.value}h <span className="text-muted-foreground">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" />
            Mis registros recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentRecords.length === 0 ? (
            <EmptyState icon={Clock} title="Sin registros aún" />
          ) : (
            <ul className="divide-y">
              {recentRecords.map((r) => (
                <li
                  key={r.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {r.activity?.title || "Registro manual"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDate(r.date)}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className={
                        r.type === "admin"
                          ? "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300"
                          : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                      }
                    >
                      {r.type === "admin" ? "Admin" : "Campo"}
                    </Badge>
                    <span className="text-sm font-semibold tabular-nums">
                      {r.hours}h
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Returns a Spanish greeting based on the local hour. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Compact metric display for the hero banner. */
function HeroMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: "emerald" | "graphite" | "rose";
}) {
  const accentColor: Record<string, string> = {
    emerald: "text-primary",
    graphite: "text-graphite-700 dark:text-graphite-400",
    rose: "text-rose-700 dark:text-rose-400",
  };
  return (
    <div className="text-center sm:text-right">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </p>
      <p className={`text-lg sm:text-xl font-bold tabular-nums ${accentColor[accent]}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * InsightsPanel — smart, data-driven recommendations shown at the bottom of
 * the admin dashboard. Each insight is computed from the dashboard data and
 * surfaces actionable observations: financial health, volunteer engagement,
 * coverage gaps, momentum, etc.
 *
 * Insights are categorized by severity (info / success / warning) and each
 * card has an icon, title, message, and optional CTA hint.
 */
type InsightSeverity = "success" | "warning" | "info" | "danger";

interface Insight {
  id: string;
  severity: InsightSeverity;
  icon: typeof Sparkles;
  title: string;
  message: string;
  hint?: string;
}

function computeInsights(data: DashboardData): Insight[] {
  const insights: Insight[] = [];

  // 1. Financial health
  if (data.balance > 0) {
    const ratio = data.totalIncome > 0 ? data.totalExpenses / data.totalIncome : 0;
    if (ratio < 0.5) {
      insights.push({
        id: "finance-healthy",
        severity: "success",
        icon: Scale,
        title: "Salud financiera sólida",
        message: `El balance es positivo (${formatCurrency(data.balance)}). Los egresos representan solo el ${(ratio * 100).toFixed(0)}% de los ingresos, dejando margen para nuevas iniciativas.`,
        hint: "Considera crear un fondo de reserva o invertir en materiales adicionales.",
      });
    } else if (ratio < 0.85) {
      insights.push({
        id: "finance-ok",
        severity: "info",
        icon: Scale,
        title: "Balance positivo, margen ajustado",
        message: `Los egresos representan el ${(ratio * 100).toFixed(0)}% de los ingresos. Balance: ${formatCurrency(data.balance)}.`,
        hint: "Revisa los egresos recurrentes para identificar oportunidades de optimización.",
      });
    } else {
      insights.push({
        id: "finance-tight",
        severity: "warning",
        icon: Scale,
        title: "Margen financiero ajustado",
        message: `Los egresos representan el ${(ratio * 100).toFixed(0)}% de los ingresos. Aunque el balance es positivo (${formatCurrency(data.balance)}), el margen es estrecho.`,
        hint: "Identifica categorías de gasto que puedan reducirse o busca nuevas fuentes de ingreso.",
      });
    }
  } else if (data.balance < 0) {
    insights.push({
      id: "finance-negative",
      severity: "danger",
      icon: TrendingDown,
      title: "Balance negativo",
      message: `Los egresos superan a los ingresos por ${formatCurrency(Math.abs(data.balance))}. Es necesario tomar acción.`,
      hint: "Revisa los egresos de mayor monto y prioriza las fuentes de ingreso pendientes.",
    });
  } else {
    insights.push({
      id: "finance-break-even",
      severity: "info",
      icon: Scale,
      title: "Punto de equilibrio",
      message: "Los ingresos y egresos están equilibrados. Cualquier gasto adicional requerirá nuevos ingresos.",
    });
  }

  // 2. Volunteer engagement — % with hours
  const withHoursPct = data.totalVolunteers > 0
    ? (data.kpis.volunteersWithHours / data.totalVolunteers) * 100
    : 0;
  if (data.totalVolunteers > 0) {
    if (withHoursPct < 50) {
      insights.push({
        id: "engagement-low",
        severity: "warning",
        icon: Users,
        title: "Baja participación registrada",
        message: `Solo ${data.kpis.volunteersWithHours} de ${data.totalVolunteers} voluntarios (${withHoursPct.toFixed(0)}%) tienen horas sociales registradas.`,
        hint: "Recuerda al equipo registrar sus horas después de cada actividad.",
      });
    } else if (withHoursPct >= 80) {
      insights.push({
        id: "engagement-high",
        severity: "success",
        icon: Users,
        title: "Alta participación del equipo",
        message: `${withHoursPct.toFixed(0)}% del equipo tiene horas registradas. ¡Buen compromiso!`,
      });
    }
  }

  // 3. Goal achievement — 100h milestones
  if (data.totalVolunteers > 0) {
    const goalPct = data.kpis.goalAchievementPct;
    if (goalPct >= 25) {
      insights.push({
        id: "goal-strong",
        severity: "success",
        icon: Target,
        title: "Equipo cercano a la meta",
        message: `${goalPct.toFixed(0)}% del equipo ha alcanzado la meta de 100 horas sociales. ${data.kpis.volunteersWithGoal} voluntario(s) cumplidos.`,
      });
    } else if (goalPct === 0 && data.kpis.volunteersWithHours > 0) {
      insights.push({
        id: "goal-none",
        severity: "info",
        icon: Target,
        title: "Nadie ha alcanzado la meta de 100h",
        message: `Hay ${data.kpis.volunteersWithHours} voluntario(s) con horas registradas, pero ninguno ha llegado a 100h. Promedio actual: ${data.kpis.avgHoursPerVolunteer.toFixed(1)}h.`,
        hint: "Planifica actividades adicionales o sesiones de clases para acelerar el progreso.",
      });
    }
  }

  // 4. Growth momentum — new volunteers
  if (data.kpis.monthlyGrowthPct > 0) {
    insights.push({
      id: "growth-up",
      severity: "success",
      icon: UserPlus,
      title: "Crecimiento mensual positivo",
      message: `${data.kpis.newVolunteersThisMonth} nuevo(s) voluntario(s) este mes (+${data.kpis.monthlyGrowthPct}% vs mes anterior).`,
    });
  } else if (data.kpis.monthlyGrowthPct < 0) {
    insights.push({
      id: "growth-down",
      severity: "warning",
      icon: UserPlus,
      title: "Crecimiento mensual negativo",
      message: `Se registraron ${data.kpis.newVolunteersThisMonth} nuevo(s) voluntario(s) este mes (${data.kpis.monthlyGrowthPct}% vs mes anterior).`,
      hint: "Considera una campaña de reclutamiento o entrevista a los que salieron para entender por qué.",
    });
  }

  // 5. Hours distribution — admin vs field balance
  if (data.totalHours > 0) {
    const adminPct = (data.adminHours / data.totalHours) * 100;
    if (adminPct > 70) {
      insights.push({
        id: "balance-admin-heavy",
        severity: "info",
        icon: Clock,
        title: "Predominio de horas administrativas",
        message: `El ${adminPct.toFixed(0)}% de las horas son administrativas. Considera equilibrar con más actividades de campo.`,
        hint: "Las horas de campo suelen tener mayor impacto directo en beneficiarios.",
      });
    } else if (adminPct < 20) {
      insights.push({
        id: "balance-field-heavy",
        severity: "info",
        icon: Clock,
        title: "Predominio de horas de campo",
        message: `Solo el ${adminPct.toFixed(0)}% de las horas son administrativas. El equipo está muy enfocado en campo.`,
        hint: "Asegúrate de que la carga administrativa esté bien repartida para evitar cuellos de botella.",
      });
    }
  }

  // 6. Committee coverage — any committee with 0 hours?
  const zeroHourCommittees = data.hoursByCommittee.filter((c) => c.hours === 0 && c.members > 0);
  if (zeroHourCommittees.length > 0) {
    insights.push({
      id: "committee-zero",
      severity: "warning",
      icon: Network,
      title: zeroHourCommittees.length === 1
        ? `Comité sin horas registradas`
        : `${zeroHourCommittees.length} comités sin horas`,
      message: zeroHourCommittees.length === 1
        ? `El comité "${zeroHourCommittees[0].name}" tiene ${zeroHourCommittees[0].members} miembro(s) pero 0 horas registradas.`
        : `Los comités ${zeroHourCommittees.map((c) => `"${c.name}"`).join(", ")} tienen miembros pero 0 horas registradas.`,
      hint: "Verifica si estos comités necesitan reactivación o reasignación de actividades.",
    });
  }

  // 7. Beneficiaries reach
  if (data.kpis.totalBeneficiaries > 0) {
    const ratio = data.totalVolunteers > 0 ? data.kpis.totalBeneficiaries / data.totalVolunteers : 0;
    if (ratio >= 30) {
      insights.push({
        id: "beneficiaries-high",
        severity: "success",
        icon: HeartHandshake,
        title: "Alto impacto en beneficiarios",
        message: `${data.kpis.totalBeneficiaries} beneficiarios alcanzados, ~${ratio.toFixed(0)} por voluntario. Excelente ratio de impacto.`,
      });
    }
  }

  return insights;
}

const INSIGHT_STYLES: Record<
  InsightSeverity,
  { container: string; icon: string; label: string; labelText: string }
> = {
  success: {
    container: "border-primary/30 bg-primary/10 dark:bg-primary/15",
    icon: "bg-primary/15 text-primary",
    label: "bg-primary/15 text-primary",
    labelText: "Positivo",
  },
  warning: {
    container: "border-graphite-200/70 dark:border-graphite-900/60 bg-graphite-50/40 dark:bg-graphite-950/20",
    icon: "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300",
    label: "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300",
    labelText: "Atención",
  },
  danger: {
    container: "border-rose-200/70 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    label: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    labelText: "Crítico",
  },
  info: {
    container: "border-sky-200/70 dark:border-sky-900/60 bg-sky-50/40 dark:bg-sky-950/20",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    label: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    labelText: "Info",
  },
};

function InsightsPanel({ data }: { data: DashboardData }) {
  const insights = computeInsights(data);
  if (insights.length === 0) return null;
  const counts = {
    success: insights.filter((i) => i.severity === "success").length,
    warning: insights.filter((i) => i.severity === "warning").length,
    danger: insights.filter((i) => i.severity === "danger").length,
    info: insights.filter((i) => i.severity === "info").length,
  };
  return (
    <Card className="ring-1 ring-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          Insights y recomendaciones
          <div className="ml-auto flex items-center gap-1.5">
            {counts.danger > 0 && (
              <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 text-[10px] tabular-nums">
                {counts.danger} crítico{counts.danger === 1 ? "" : "s"}
              </Badge>
            )}
            {counts.warning > 0 && (
              <Badge className="bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300 text-[10px] tabular-nums">
                {counts.warning} atención
              </Badge>
            )}
            {counts.success > 0 && (
              <Badge className="bg-primary/15 text-primary text-[10px] tabular-nums">
                {counts.success} positivo{counts.success === 1 ? "" : "s"}
              </Badge>
            )}
            {counts.info > 0 && (
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {counts.info} info
              </Badge>
            )}
          </div>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Observaciones automáticas generadas a partir de los datos actuales del sistema.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((insight, idx) => {
            const style = INSIGHT_STYLES[insight.severity];
            const Icon = insight.icon;
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.06, 0.4), duration: 0.3 }}
                className={`rounded-lg border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${style.container}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`size-9 rounded-md flex items-center justify-center shrink-0 ${style.icon}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold leading-tight">{insight.title}</p>
                      <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${style.label}`}>
                        {style.labelText}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {insight.message}
                    </p>
                    {insight.hint && (
                      <p className="text-[11px] mt-2 pt-2 border-t border-border/50 text-foreground/80 flex items-start gap-1.5">
                        <Sparkles className="size-3 shrink-0 mt-0.5 text-primary" />
                        <span>{insight.hint}</span>
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
