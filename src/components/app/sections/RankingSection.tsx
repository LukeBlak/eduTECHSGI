"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Trophy,
  Medal,
  Award,
  Crown,
  Flame,
  Target,
  TrendingUp,
  Users,
  Sparkles,
  Star,
  Zap,
  ShieldCheck,
  GraduationCap,
  Clock,
  Download,
} from "lucide-react";
import {
  volunteersApi,
  socialHoursApi,
  committeesApi,
  downloadCsv,
  type Volunteer,
  type SocialHour,
  type Committee,
} from "@/lib/api";
import { SectionHeader, EmptyState, KpiCard } from "../Shared";
import { cn } from "@/lib/utils";

interface RankingEntry {
  volunteer: Volunteer;
  totalHours: number;
  adminHours: number;
  fieldHours: number;
  recordCount: number;
  rank: number;
  tier: "gold" | "silver" | "bronze" | "rising" | "rookie";
  awards: Award[];
}

type Award = {
  id: string;
  label: string;
  description: string;
  icon: typeof Trophy;
  color: string;
};

const TIERS = {
  gold: { label: "Oro", color: "graphite", icon: Crown, ring: "ring-graphite-500/30", bg: "bg-graphite-500/10", text: "text-graphite-700 dark:text-graphite-400" },
  silver: { label: "Plata", color: "slate", icon: Medal, ring: "ring-slate-400/30", bg: "bg-slate-400/10", text: "text-slate-700 dark:text-slate-300" },
  bronze: { label: "Bronce", color: "orange", icon: Award, ring: "ring-orange-500/30", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400" },
  rising: { label: "En ascenso", color: "emerald", icon: TrendingUp, ring: "ring-primary/30", bg: "bg-primary/10", text: "text-primary" },
  rookie: { label: "Novato", color: "sky", icon: Sparkles, ring: "ring-sky-500/30", bg: "bg-sky-500/10", text: "text-sky-700 dark:text-sky-400" },
} as const;

const MILESTONE_AWARDS: { threshold: number; award: Award }[] = [
  { threshold: 200, award: { id: "200h", label: "Leyenda", description: "200+ horas sociales", icon: Crown, color: "graphite" } },
  { threshold: 100, award: { id: "100h", label: "Meta alcanzada", description: "100+ horas (meta ESEN)", icon: Target, color: "emerald" } },
  { threshold: 50, award: { id: "50h", label: "Comprometido", description: "50+ horas sociales", icon: ShieldCheck, color: "violet" } },
  { threshold: 25, award: { id: "25h", label: "Constante", description: "25+ horas sociales", icon: Zap, color: "sky" } },
  { threshold: 10, award: { id: "10h", label: "Iniciador", description: "10+ horas sociales", icon: Star, color: "rose" } },
  { threshold: 1, award: { id: "1h", label: "Primer paso", description: "Primera hora social", icon: Flame, color: "orange" } },
];

function getAwards(totalHours: number, recordCount: number, isAdmin: boolean): Award[] {
  const awards: Award[] = [];
  for (const { threshold, award } of MILESTONE_AWARDS) {
    if (totalHours >= threshold) {
      awards.push(award);
      break; // only the highest milestone
    }
  }
  if (recordCount >= 10) {
    awards.push({
      id: "10r",
      label: "Prolífico",
      description: "10+ registros de horas",
      icon: GraduationCap,
      color: "teal",
    });
  }
  if (isAdmin) {
    awards.push({
      id: "admin",
      label: "Administrador",
      description: "Personal administrativo",
      icon: ShieldCheck,
      color: "violet",
    });
  }
  return awards;
}

function getTier(rank: number, totalHours: number): keyof typeof TIERS {
  if (totalHours === 0) return "rookie";
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  if (totalHours >= 25) return "rising";
  return "rising";
}

const AWARD_COLORS: Record<string, string> = {
  graphite: "bg-graphite-100 text-graphite-700 dark:bg-graphite-950/60 dark:text-graphite-300",
  emerald: "bg-primary/15 text-primary",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  teal: "bg-secondary/30 text-secondary-foreground dark:text-secondary",
};

export function RankingSection() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [hours, setHours] = useState<SocialHour[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      volunteersApi.list(),
      socialHoursApi.list(),
      committeesApi.list(),
    ])
      .then(([vs, hs, cs]) => {
        if (cancelled) return;
        setVolunteers(vs);
        setHours(hs);
        setCommittees(cs);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const ranking = useMemo<RankingEntry[]>(() => {
    const byVolunteer = new Map<string, { totalHours: number; adminHours: number; fieldHours: number; recordCount: number }>();
    for (const h of hours) {
      const cur = byVolunteer.get(h.volunteerId) ?? { totalHours: 0, adminHours: 0, fieldHours: 0, recordCount: 0 };
      cur.totalHours += h.hours;
      if (h.type === "admin") cur.adminHours += h.hours;
      else cur.fieldHours += h.hours;
      cur.recordCount += 1;
      byVolunteer.set(h.volunteerId, cur);
    }
    const entries: Omit<RankingEntry, "rank" | "tier" | "awards">[] = volunteers
      .filter((v) => v.role === "volunteer")
      .map((v) => {
        const h = byVolunteer.get(v.id) ?? { totalHours: 0, adminHours: 0, fieldHours: 0, recordCount: 0 };
        return { volunteer: v, ...h };
      })
      .sort((a, b) => b.totalHours - a.totalHours || b.recordCount - a.recordCount);

    return entries.map((e, idx) => {
      const rank = idx + 1;
      return {
        ...e,
        rank,
        tier: getTier(rank, e.totalHours),
        awards: getAwards(e.totalHours, e.recordCount, e.volunteer.role === "admin"),
      };
    });
  }, [volunteers, hours]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalHoursSum = ranking.reduce((s, r) => s + r.totalHours, 0);
    const goalAchievers = ranking.filter((r) => r.totalHours >= 100).length;
    const avgHours = ranking.length > 0 ? totalHoursSum / ranking.length : 0;
    const maxHours = ranking.length > 0 ? ranking[0].totalHours : 0;
    return { totalHoursSum, goalAchievers, avgHours, maxHours, count: ranking.length };
  }, [ranking]);

  // Podium (top 3)
  const podium = ranking.slice(0, 3);
  const others = ranking.slice(3);

  function handleExportCsv() {
    if (ranking.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }
    const headers = [
      "Ranking",
      "Carnet",
      "Nombre",
      "Carrera",
      "Comité",
      "Horas totales",
      "Horas administrativas",
      "Horas de campo",
      "Registros",
      "Categoría",
      "Logros",
    ];
    const rows = ranking.map((e) => {
      const committeeName = committees.find((c) => c.id === e.volunteer.committeeId)?.name || "Sin comité";
      const tierLabel = TIERS[e.tier].label;
      const awardLabels = e.awards.map((a) => a.label).join("; ");
      return [
        e.rank,
        e.volunteer.studentId,
        e.volunteer.name,
        e.volunteer.career,
        committeeName,
        e.totalHours,
        e.adminHours,
        e.fieldHours,
        e.recordCount,
        tierLabel,
        awardLabels,
      ];
    });
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`ranking-voluntarios-${today}.csv`, headers, rows);
    toast.success(`Ranking exportado (${ranking.length} voluntario(s))`);
  }

  // Find committee contribution leaderboard
  const committeeStats = useMemo(() => {
    return committees
      .map((c) => {
        const members = volunteers.filter((v) => v.committeeId === c.id && v.role === "volunteer");
        const memberIds = new Set(members.map((m) => m.id));
        const committeeHours = hours.filter((h) => memberIds.has(h.volunteerId));
        const total = committeeHours.reduce((s, h) => s + h.hours, 0);
        return { committee: c, members: members.length, totalHours: total };
      })
      .filter((c) => c.members > 0)
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [committees, volunteers, hours]);

  if (loading) return <RankingSkeleton />;
  if (error) {
    return (
      <EmptyState
        icon={Trophy}
        title="No se pudo cargar el ranking"
        description={error}
      />
    );
  }

  if (ranking.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Sin voluntarios para clasificar"
        description="Agrega voluntarios y registra horas sociales para ver el ranking."
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Ranking de voluntarios"
        description="Reconocimiento al esfuerzo y compromiso del equipo"
        action={
          <Button
            variant="outline"
            onClick={handleExportCsv}
            className="h-11 gap-2"
            disabled={ranking.length === 0}
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Voluntarios clasificados"
          value={stats.count}
          icon={Users}
          accent="emerald"
          description="En el ranking actual"
        />
        <KpiCard
          title="Horas totales"
          value={`${stats.totalHoursSum}h`}
          icon={Clock}
          accent="graphite"
          description="Acumuladas por voluntarios"
        />
        <KpiCard
          title="Meta 100h"
          value={stats.goalAchievers}
          icon={Target}
          accent="violet"
          description="Voluntarios que alcanzaron la meta"
          progress={{
            value: stats.count > 0 ? (stats.goalAchievers / stats.count) * 100 : 0,
            label: `${stats.count > 0 ? Math.round((stats.goalAchievers / stats.count) * 100) : 0}% del equipo`,
          }}
        />
        <KpiCard
          title="Promedio"
          value={`${stats.avgHours.toFixed(1)}h`}
          icon={TrendingUp}
          accent="teal"
          description="Por voluntario"
        />
      </div>

      {/* Podium */}
      {podium.length > 0 && (
        <Card className="relative overflow-hidden ring-1 ring-graphite-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-graphite-500/5 via-transparent to-transparent pointer-events-none" />
          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-graphite-600" />
              Podio de honor
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {podium.map((entry, idx) => {
                const tier = TIERS[entry.tier];
                const TierIcon = tier.icon;
                // For mobile, render in order. For sm+, render 2-1-3 (silver-gold-bronze)
                const smOrder = idx === 0 ? "sm:order-2" : idx === 1 ? "sm:order-1" : "sm:order-3";
                const heightClass = idx === 0
                  ? "sm:pt-2 sm:pb-6"
                  : idx === 1
                    ? "sm:pt-6 sm:pb-4"
                    : "sm:pt-4 sm:pb-2";
                return (
                  <motion.div
                    key={entry.volunteer.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1, duration: 0.4 }}
                    className={cn("relative", smOrder, heightClass)}
                  >
                    <div
                      className={cn(
                        "relative rounded-xl border-2 p-4 text-center bg-background transition-all hover:shadow-lg",
                        idx === 0
                          ? "border-graphite-300 dark:border-graphite-700/50 shadow-md shadow-graphite-500/10"
                          : idx === 1
                            ? "border-slate-300 dark:border-slate-700"
                            : "border-orange-300 dark:border-orange-800/50",
                      )}
                    >
                      {/* Rank badge */}
                      <div
                        className={cn(
                          "absolute -top-3 left-1/2 -translate-x-1/2 size-8 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md",
                          idx === 0 ? "bg-graphite-500" : idx === 1 ? "bg-slate-400" : "bg-orange-600",
                        )}
                      >
                        {idx + 1}
                      </div>
                      <div className="pt-2">
                        <div
                          className={cn(
                            "size-16 mx-auto rounded-full flex items-center justify-center mb-3 ring-2",
                            tier.bg,
                            tier.ring,
                          )}
                        >
                          <TierIcon className={cn("size-7", tier.text)} />
                        </div>
                        <p className="font-semibold leading-tight mb-0.5 truncate">
                          {entry.volunteer.name}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums mb-2">
                          {entry.volunteer.studentId}
                        </p>
                        <div className="text-2xl font-bold tabular-nums text-graphite-700 dark:text-graphite-400">
                          {entry.totalHours}h
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {entry.recordCount} registro(s) · {entry.fieldHours}h campo · {entry.adminHours}h admin
                        </p>
                        {entry.awards.length > 0 && (
                          <div className="mt-3 flex flex-wrap justify-center gap-1">
                            {entry.awards.slice(0, 3).map((a) => {
                              const AIcon = a.icon;
                              return (
                                <span
                                  key={a.id}
                                  title={a.description}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                                    AWARD_COLORS[a.color] || AWARD_COLORS.emerald,
                                  )}
                                >
                                  <AIcon className="size-2.5" />
                                  {a.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full ranking table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-primary" />
            Tabla completa
            <Badge variant="secondary" className="ml-auto tabular-nums">
              {ranking.length} voluntario(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-y-auto scroll-thin -mx-2 px-2">
            <ul className="space-y-2">
              {ranking.map((entry) => {
                const tier = TIERS[entry.tier];
                const TierIcon = tier.icon;
                const progressPct = stats.maxHours > 0
                  ? Math.min(100, (entry.totalHours / stats.maxHours) * 100)
                  : 0;
                return (
                  <li
                    key={entry.volunteer.id}
                    className={cn(
                      "rounded-lg border p-3 transition-all hover:shadow-sm hover:border-primary/30",
                      entry.rank <= 3 && "ring-1",
                      entry.rank === 1 && "ring-graphite-500/20 bg-graphite-50/30 dark:bg-graphite-950/10",
                      entry.rank === 2 && "ring-slate-400/20",
                      entry.rank === 3 && "ring-orange-500/20",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank number */}
                      <div
                        className={cn(
                          "size-9 rounded-lg flex items-center justify-center font-bold text-sm tabular-nums shrink-0",
                          entry.rank === 1
                            ? "bg-graphite-100 text-graphite-700 dark:bg-graphite-950 dark:text-graphite-300"
                            : entry.rank === 2
                              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              : entry.rank === 3
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                : "bg-muted text-muted-foreground",
                        )}
                      >
                        {entry.rank}
                      </div>

                      {/* Avatar */}
                      <Avatar className="size-9 border-2 border-background shrink-0">
                        <AvatarFallback className={cn("text-xs font-semibold", tier.bg, tier.text)}>
                          {entry.volunteer.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      {/* Name + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{entry.volunteer.name}</p>
                          <TierIcon className={cn("size-3.5 shrink-0", tier.text)} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate tabular-nums">
                          {entry.volunteer.studentId} · {entry.volunteer.career}
                        </p>
                        {/* Progress bar to leader */}
                        <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", tier.bg.replace("/10", "/60"))}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 w-24">
                        <p className="text-sm font-bold tabular-nums">{entry.totalHours}h</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {entry.recordCount} reg · {entry.fieldHours}c/{entry.adminHours}a
                        </p>
                      </div>

                      {/* Awards */}
                      <div className="hidden md:flex flex-wrap justify-end gap-1 shrink-0 max-w-[160px]">
                        {entry.awards.slice(0, 2).map((a) => {
                          const AIcon = a.icon;
                          return (
                            <span
                              key={a.id}
                              title={a.description}
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                                AWARD_COLORS[a.color] || AWARD_COLORS.emerald,
                              )}
                            >
                              <AIcon className="size-2.5" />
                              {a.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Committee contribution */}
      {committeeStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-4 text-primary" />
              Contribución por comité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {committeeStats.map((c, idx) => {
                const max = committeeStats[0]?.totalHours || 1;
                const pct = (c.totalHours / max) * 100;
                const tier = idx === 0 ? TIERS.gold : idx === 1 ? TIERS.silver : idx === 2 ? TIERS.bronze : TIERS.rising;
                return (
                  <div key={c.committee.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="size-2 rounded-full shrink-0" style={{ background: `var(--color-${c.committee.color}, #10616D)` }} />
                        <span className="font-medium truncate">{c.committee.name}</span>
                        <Badge variant="secondary" className="text-[10px] h-5 tabular-nums">
                          {c.members} miembro(s)
                        </Badge>
                      </div>
                      <span className="font-bold tabular-nums shrink-0">{c.totalHours}h</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awards legend */}
      <Card className="ring-1 ring-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="size-4 text-primary" />
            Logros disponibles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MILESTONE_AWARDS.map(({ award }) => {
              const AIcon = award.icon;
              return (
                <div
                  key={award.id}
                  className={cn(
                    "rounded-lg border p-3 transition-all hover:shadow-sm hover:-translate-y-0.5",
                    "border-border bg-background",
                  )}
                >
                  <div className={cn("size-8 rounded-md flex items-center justify-center mb-2", AWARD_COLORS[award.color])}>
                    <AIcon className="size-4" />
                  </div>
                  <p className="text-sm font-semibold leading-tight">{award.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{award.description}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RankingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
