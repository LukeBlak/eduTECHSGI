"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  UserCircle,
  Clock,
  CalendarDays,
  GraduationCap,
  Award,
  Printer,
  Mail,
  Phone,
  IdCard,
  Network,
  Loader2,
  TrendingUp,
  Download,
  Hexagon,
  Users2,
  Trophy,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/lib/auth-store";
import {
  volunteersApi,
  committeesApi,
  socialHoursApi,
  activitiesApi,
  classesApi,
  achievementsApi,
  tierConfig,
  formatDate,
  downloadCsv,
  type Volunteer,
  type Committee,
  type VolunteerHours,
  type SocialHour,
  type ClassItem,
  type Activity,
  type VolunteerAchievement,
} from "@/lib/api";
import { SectionHeader, EmptyState } from "../Shared";

const HOUR_GOAL = 10; // Meta de horas sociales para la barra de progreso

export function PerfilSection() {
  const { user } = useAuthStore();
  const [volunteer, setVolunteer] = useState<(Volunteer & {
    socialHours?: SocialHour[];
    activityLinks?: { activity: Activity }[];
    classLinks?: { class: ClassItem; role: string }[];
  }) | null>(null);
  const [hours, setHours] = useState<VolunteerHours | null>(null);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [myAchievements, setMyAchievements] = useState<VolunteerAchievement[]>([]);
  const [loadingAchievements, setLoadingAchievements] = useState(true);
  // Team aggregates for comparative radar
  const [teamStats, setTeamStats] = useState<{
    avgAdmin: number;
    avgField: number;
    avgClasses: number;
    avgBeneficiaries: number;
    avgRecords: number;
    teamSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      volunteersApi.get(user.id),
      volunteersApi.hours(user.id),
      committeesApi.list(),
      // For comparative radar — fetch team aggregates
      socialHoursApi.list(),
      activitiesApi.list(),
      classesApi.list(),
      volunteersApi.list(),
      achievementsApi.mine(),
    ])
      .then(([v, h, c, allHours, allActivities, allClasses, allVolunteers, achs]) => {
        if (cancelled) return;
        setVolunteer(v);
        setHours(h);
        setCommittees(c);
        setMyAchievements(achs);
        setLoadingAchievements(false);

        // Compute team averages across volunteers with at least 1 hour record.
        const volunteersWithHours = new Set<string>();
        const perVolunteer = new Map<string, {
          admin: number;
          field: number;
          records: number;
          activityIds: Set<string>;
        }>();
        for (const sh of allHours) {
          volunteersWithHours.add(sh.volunteerId);
          const cur = perVolunteer.get(sh.volunteerId) ?? {
            admin: 0,
            field: 0,
            records: 0,
            activityIds: new Set<string>(),
          };
          if (sh.type === "admin") cur.admin += sh.hours;
          else cur.field += sh.hours;
          cur.records += 1;
          if (sh.activityId) cur.activityIds.add(sh.activityId);
          perVolunteer.set(sh.volunteerId, cur);
        }
        // Map activityId → total beneficiaries (men + women)
        const actBenef = new Map<string, number>();
        for (const a of allActivities) {
          actBenef.set(a.id, (a.beneficiariesMen || 0) + (a.beneficiariesWomen || 0));
        }
        // Count instructor-class links per volunteer
        const instructorCount = new Map<string, number>();
        for (const cls of allClasses) {
          for (const ins of cls.instructors || []) {
            instructorCount.set(ins.id, (instructorCount.get(ins.id) ?? 0) + 1);
          }
        }
        const teamSize = volunteersWithHours.size || 1;
        let sumAdmin = 0, sumField = 0, sumRecords = 0, sumBenef = 0, sumClasses = 0;
        for (const vId of volunteersWithHours) {
          const stat = perVolunteer.get(vId)!;
          sumAdmin += stat.admin;
          sumField += stat.field;
          sumRecords += stat.records;
          let benef = 0;
          for (const aId of stat.activityIds) {
            benef += actBenef.get(aId) ?? 0;
          }
          sumBenef += benef;
          sumClasses += instructorCount.get(vId) ?? 0;
        }
        setTeamStats({
          avgAdmin: sumAdmin / teamSize,
          avgField: sumField / teamSize,
          avgClasses: sumClasses / teamSize,
          avgBeneficiaries: sumBenef / teamSize,
          avgRecords: sumRecords / teamSize,
          teamSize: volunteersWithHours.size,
        });
        // Silence unused warning for allVolunteers (used implicitly via teamSize counting)
        void allVolunteers;
      })
      .catch((e: unknown) => {
        if (!cancelled)
          toast.error(e instanceof Error ? e.message : "Error al cargar perfil");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) return <PerfilSkeleton />;
  if (!volunteer || !hours) {
    return (
      <EmptyState
        icon={UserCircle}
        title="No se pudo cargar tu perfil"
        description="Inténtalo de nuevo en unos momentos"
      />
    );
  }

  const myCommittee = committees.find((c) => c.id === volunteer.committeeId);
  const hoursPct = Math.min(100, (hours.totalHours / HOUR_GOAL) * 100);
  const instructorClasses = volunteer.classLinks?.filter((l) => l.role === "instructor") ?? [];
  const assistantClasses = volunteer.classLinks?.filter((l) => l.role === "assistant") ?? [];

  // Radar chart data: 5 dimensions of volunteer contribution, each
  // normalized to a target value that makes sense for the ESEN context.
  // Targets are chosen so that "100%" represents a strong, well-rounded
  // volunteer — exceeding the cap is fine and just shows as 100.
  // Note: computed inline (not useMemo) because it depends on volunteer/hours
  // which are guaranteed non-null after the early returns above.
  const radarData = (() => {
    // Sum beneficiaries from linked activities (volunteer's social hours
    // are tied to activities via activityId; activityLinks carries the
    // full activity records with beneficiary counts).
    const linkedActivityIds = new Set(
      hours.records.map((r) => r.activityId).filter(Boolean),
    );
    const totalBeneficiaries = (volunteer.activityLinks || []).reduce(
      (sum, link) => {
        if (!linkedActivityIds.has(link.activity.id)) return sum;
        return (
          sum +
          (link.activity.beneficiariesMen || 0) +
          (link.activity.beneficiariesWomen || 0)
        );
      },
      0,
    );

    const cap = (v: number, target: number) =>
      Math.min(100, Math.round((v / target) * 100));

    // Per-dimension raw values for me + team averages
    const myDims = [
      { dim: "Admin", raw: hours.adminHours, target: 50, teamAvg: teamStats?.avgAdmin },
      { dim: "Campo", raw: hours.fieldHours, target: 50, teamAvg: teamStats?.avgField },
      { dim: "Clases", raw: instructorClasses.length, target: 10, teamAvg: teamStats?.avgClasses },
      { dim: "Benef.", raw: totalBeneficiaries, target: 100, teamAvg: teamStats?.avgBeneficiaries },
      { dim: "Registros", raw: hours.records.length, target: 15, teamAvg: teamStats?.avgRecords },
    ];
    return myDims.map((d) => ({
      dimension: d.dim,
      value: cap(d.raw, d.target),
      raw: d.raw,
      target: d.target,
      teamAvg: d.teamAvg !== undefined ? cap(d.teamAvg, d.target) : undefined,
      teamAvgRaw: d.teamAvg,
    }));
  })();

  const radarScore = Math.round(
    radarData.reduce((sum, d) => sum + d.value, 0) / radarData.length,
  );

  function handlePrintCertificate() {
    const printContents = document.getElementById("certificate-print");
    if (!printContents) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Permite las ventanas emergentes para descargar la constancia");
      return;
    }
    w.document.write(`
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Constancia de Horas Sociales — ${escapeHtml(volunteer!.name)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Georgia, 'Times New Roman', serif;
              margin: 0;
              padding: 48px;
              color: #0a4a52;
              background: #ffffff;
            }
            .doc {
              border: 3px double #10616D;
              padding: 48px 56px;
              position: relative;
              min-height: 90vh;
            }
            .doc::before {
              content: '';
              position: absolute;
              top: 12px; left: 12px; right: 12px; bottom: 12px;
              border: 1px solid #cce5e7;
              pointer-events: none;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #10616D;
              padding-bottom: 20px;
              margin-bottom: 36px;
            }
            .org {
              font-size: 28px;
              font-weight: bold;
              letter-spacing: 2px;
              color: #10616D;
            }
            .sub {
              font-size: 13px;
              color: #0a4a52;
              margin-top: 4px;
              letter-spacing: 1px;
            }
            .title {
              text-align: center;
              font-size: 22px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 4px;
              margin: 24px 0 32px;
              color: #0a4a52;
            }
            .body {
              font-size: 15px;
              line-height: 1.9;
              text-align: justify;
              margin: 0 24px;
            }
            .name {
              text-align: center;
              font-size: 26px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin: 24px 0 8px;
              color: #10616D;
            }
            .meta {
              text-align: center;
              font-size: 13px;
              color: #0a4a52;
              margin-bottom: 32px;
            }
            .stats {
              display: flex;
              justify-content: center;
              gap: 48px;
              margin: 32px 0;
            }
            .stat {
              text-align: center;
            }
            .stat-num {
              font-size: 36px;
              font-weight: bold;
              color: #10616D;
            }
            .stat-label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #0a4a52;
            }
            .sign {
              margin-top: 64px;
              display: flex;
              justify-content: space-around;
              gap: 48px;
            }
            .sign-block {
              text-align: center;
              flex: 1;
            }
            .sign-line {
              border-top: 1px solid #10616D;
              padding-top: 8px;
              font-size: 13px;
              color: #10616D;
            }
            .sign-role {
              font-size: 11px;
              color: #0a4a52;
              margin-top: 2px;
            }
            .footer {
              text-align: center;
              font-size: 11px;
              color: #6b7280;
              margin-top: 48px;
              border-top: 1px solid #cce5e7;
              padding-top: 12px;
            }
            @media print {
              body { padding: 0; }
              .doc { min-height: auto; border: 3px double #10616D; }
            }
          </style>
        </head>
        <body>
          <div class="doc">
            <div class="header">
              <div class="org">EDUTECH ESEN</div>
              <div class="sub">ASOCIACIÓN DE VOLUNTARIADO · ESCUELA SUPERIOR DE ECONOMÍA Y NEGOCIOS</div>
            </div>
            <div class="title">Constancia de Horas Sociales</div>
            <div class="body">
              El Consejo Directivo de la asociación <strong>EduTECH ESEN</strong> hace constar que:
            </div>
            <div class="name">${escapeHtml(volunteer!.name)}</div>
            <div class="meta">
              Carnet: <strong>${escapeHtml(volunteer!.studentId)}</strong>
              ${volunteer!.career ? ` · Carrera: ${escapeHtml(volunteer!.career)}` : ""}
              ${myCommittee ? ` · Comité: ${escapeHtml(myCommittee.name)}` : ""}
            </div>
            <div class="body">
              Ha participado como voluntario(a) activo(a) en los proyectos y actividades de la asociación,
              acumulando un total de <strong>${hours!.totalHours} horas sociales</strong>, distribuidas entre
              ${hours!.adminHours} horas administrativas y ${hours!.fieldHours} horas de campo, según los
              registros del sistema institucional al ${formatDate(new Date().toISOString())}.
            </div>
            <div class="stats">
              <div class="stat">
                <div class="stat-num">${hours!.totalHours}</div>
                <div class="stat-label">Horas totales</div>
              </div>
              <div class="stat">
                <div class="stat-num">${hours!.adminHours}</div>
                <div class="stat-label">Administrativas</div>
              </div>
              <div class="stat">
                <div class="stat-num">${hours!.fieldHours}</div>
                <div class="stat-label">De campo</div>
              </div>
              <div class="stat">
                <div class="stat-num">${hours!.records.length}</div>
                <div class="stat-label">Registros</div>
              </div>
            </div>
            <div class="body">
              Se expide la presente constancia a solicitud del interesado(a) para los usos que estime
              convenientes. Santa Tecla, La Libertad, El Salvador, ${formatDate(new Date().toISOString())}.
            </div>
            <div class="sign">
              <div class="sign-block">
                <div class="sign-line">Coordinador General</div>
                <div class="sign-role">EduTECH ESEN</div>
              </div>
              <div class="sign-block">
                <div class="sign-line">Consejo Directivo</div>
                <div class="sign-role">Asociación EduTECH ESEN</div>
              </div>
            </div>
            <div class="footer">
              Documento generado automáticamente por el sistema EduTECH ESEN ·
              ID de voluntario: ${volunteer!.id}
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            };
          </script>
        </body>
      </html>
    `);
    w.document.close();
  }

  function handleExportCsv() {
    if (!hours || !volunteer) return;
    if (hours.records.length === 0) {
      toast.error("No hay registros de horas para exportar");
      return;
    }
    const headers = ["Fecha", "Actividad", "Tipo", "Horas", "Notas"];
    const rows = hours.records
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((r) => [
        r.date || "—",
        r.activity?.title || "Registro manual",
        r.type === "admin" ? "Administrativa" : "De campo",
        r.hours,
        r.notes || "",
      ]);
    downloadCsv(`horas-sociales-${volunteer.studentId}.csv`, headers, rows);
    toast.success("CSV exportado");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Mi Perfil"
        description="Tu información y registro de horas sociales"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleExportCsv}
              variant="outline"
              className="h-11"
              disabled={!hours || hours.records.length === 0}
            >
              <Download className="size-4" /> Exportar CSV
            </Button>
            <Button
              onClick={handlePrintCertificate}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Printer className="size-4" /> Descargar constancia
            </Button>
          </div>
        }
      />

      {/* Profile card */}
      <Card className="overflow-hidden ring-1 ring-primary/20">
        <div className="h-20 bg-brand-gradient-vivid relative">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_50%,white,transparent)]" />
        </div>
        <CardContent className="p-6 -mt-12 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="size-24 rounded-2xl bg-brand-gradient flex items-center justify-center text-white text-4xl font-bold shadow-lg ring-4 ring-background shrink-0">
              {volunteer.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="flex-1 min-w-0 sm:pb-2">
              <h3 className="text-xl font-bold tracking-tight truncate">{volunteer.name}</h3>
              <p className="text-sm text-muted-foreground">
                {volunteer.role === "admin" ? "Administrador" : "Voluntario"}
                {myCommittee && ` · ${myCommittee.name}`}
              </p>
            </div>
            {hours.totalHours >= HOUR_GOAL && (
              <Badge className="bg-graphite-100 text-graphite-800 dark:bg-graphite-950 dark:text-graphite-300 self-start sm:self-auto">
                <Award className="size-3 mr-1" /> Meta alcanzada
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <InfoChip icon={IdCard} label="Carnet" value={volunteer.studentId} />
            <InfoChip icon={GraduationCap} label="Carrera" value={volunteer.career || "—"} />
            <InfoChip icon={Mail} label="Email" value={volunteer.email || "—"} />
            <InfoChip icon={Phone} label="Teléfono" value={volunteer.phone || "—"} />
          </div>

          {myCommittee && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Network className="size-4 text-primary" />
              <span className="text-muted-foreground">Comité asignado:</span>
              <Badge className="bg-primary/15 text-primary">
                {myCommittee.name}
              </Badge>
              {myCommittee.description && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  · {myCommittee.description}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hours summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="ring-1 ring-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-primary">
              <Clock className="size-4" />
              <p className="text-xs font-medium">Horas totales</p>
            </div>
            <p className="text-3xl font-bold mt-1">{hours.totalHours}</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Meta: {HOUR_GOAL} h</span>
                <span>{Math.round(hoursPct)}%</span>
              </div>
              <Progress value={hoursPct} className="h-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-graphite-700 dark:text-graphite-400">
              <TrendingUp className="size-4" />
              <p className="text-xs font-medium">Horas administrativas</p>
            </div>
            <p className="text-3xl font-bold mt-1">{hours.adminHours}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {hours.records.filter((r) => r.type === "admin").length} registro(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-secondary-foreground dark:text-secondary">
              <CalendarDays className="size-4" />
              <p className="text-xs font-medium">Horas de campo</p>
            </div>
            <p className="text-3xl font-bold mt-1">{hours.fieldHours}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {hours.records.filter((r) => r.type === "field").length} registro(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mis Logros — galería compacta de logros ganados */}
      <Card className="ring-1 ring-primary/10 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-primary" />
            Mis Logros
            <Badge variant="secondary" className="ml-auto">
              {myAchievements.length} desbloqueado{myAchievements.length === 1 ? "" : "s"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {loadingAchievements ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : myAchievements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="size-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Lock className="size-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Aún no has desbloqueado logros</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Participa en actividades, clases y acumula horas sociales para ganar
                logros. ¡Algunos se desbloquean automáticamente!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {myAchievements.map((g) => {
                const tier = tierConfig(g.achievement.tier);
                const ach = g.achievement;
                return (
                  <div
                    key={g.id}
                    className={`relative rounded-xl p-3 ring-1 ${tier.ring} ${tier.bg} flex items-center gap-3`}
                  >
                    <div
                      className={`size-10 rounded-xl flex items-center justify-center text-xl shrink-0 ring-1 ${tier.text}`}
                    >
                      <span aria-hidden>{tier.emoji}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{ach.name}</p>
                      <p className={`text-[10px] ${tier.text} truncate`}>
                        {tier.label} · {ach.points} pts
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDate(g.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Radar chart — 5-dimension contribution profile, with team comparison */}
      <Card className="ring-1 ring-primary/10 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hexagon className="size-4 text-primary" />
            Perfil de contribución
            <Badge
              variant="secondary"
              className="ml-auto bg-primary/15 text-primary tabular-nums"
            >
              Índice {radarScore}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Cinco dimensiones de tu aportación al programa, normalizadas a metas de referencia.
            {teamStats && (
              <span className="ml-1 text-primary">
                Comparado con el promedio del equipo ({teamStats.teamSize} voluntario{teamStats.teamSize === 1 ? "" : "s"} con horas).
              </span>
            )}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
            <div className="lg:col-span-3 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="currentColor" className="text-muted-foreground/30" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="fill-muted-foreground"
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 9, fill: "currentColor" }}
                    className="fill-muted-foreground/60"
                    tickCount={5}
                  />
                  <Radar
                    name="Tu perfil"
                    dataKey="value"
                    stroke="#10616D"
                    strokeWidth={2}
                    fill="#10616D"
                    fillOpacity={0.35}
                    dot={{ r: 3, fill: "#10616D", strokeWidth: 0 }}
                  />
                  {teamStats && (
                    <Radar
                      name="Promedio del equipo"
                      dataKey="teamAvg"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      fill="#94a3b8"
                      fillOpacity={0.08}
                      dot={{ r: 2, fill: "#94a3b8", strokeWidth: 0 }}
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string, item) => {
                      const payload = item?.payload as {
                        raw?: number;
                        teamAvgRaw?: number;
                        target?: number;
                      } | undefined;
                      const target = payload?.target ?? 100;
                      if (name === "Promedio del equipo") {
                        const raw = payload?.teamAvgRaw ?? value;
                        return [`${raw.toFixed(1)} / ${target} (meta)`, "Promedio equipo"];
                      }
                      const raw = payload?.raw ?? value;
                      return [`${raw} / ${target} (meta)`, "Tu perfil"];
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-2 space-y-2">
              {radarData.map((d, idx) => {
                const teamPct = teamStats
                  ? Math.min(100, Math.round(
                      ((
                        idx === 0 ? teamStats.avgAdmin
                        : idx === 1 ? teamStats.avgField
                        : idx === 2 ? teamStats.avgClasses
                        : idx === 3 ? teamStats.avgBeneficiaries
                        : teamStats.avgRecords
                      ) / d.target) * 100,
                    ))
                  : null;
                const teamRaw =
                  idx === 0 ? teamStats?.avgAdmin
                  : idx === 1 ? teamStats?.avgField
                  : idx === 2 ? teamStats?.avgClasses
                  : idx === 3 ? teamStats?.avgBeneficiaries
                  : teamStats?.avgRecords;
                const delta = teamPct !== null ? d.value - teamPct : 0;
                return (
                  <motion.div
                    key={d.dimension}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05, duration: 0.3 }}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border bg-muted/30 transition-all hover:bg-muted/60 hover:border-primary/30 hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.dimension}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        Tú: {d.raw} · {teamRaw !== undefined ? `Equipo: ${teamRaw.toFixed(1)}` : "—"} / {d.target} meta
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {teamPct !== null && (
                        <span
                          className={
                            "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded " +
                            (delta > 0
                              ? "bg-primary/15 text-primary"
                              : delta < 0
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-muted text-muted-foreground")
                          }
                          title={delta > 0 ? "Estás por encima del promedio" : delta < 0 ? "Estás por debajo del promedio" : "Estás en el promedio"}
                        >
                          {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}%
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="tabular-nums shrink-0 border-primary/30 text-primary"
                      >
                        {d.value}%
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
              <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                <Users2 className="size-3.5 shrink-0" />
                <span>
                  El índice es el promedio de las 5 dimensiones. Busca equilibrio entre administración, campo y docencia.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hours by activity */}
      {hours.byActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" />
              Horas por actividad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 max-h-72 overflow-y-auto scroll-thin pr-1">
              {hours.byActivity.map((a) => {
                const maxH = Math.max(...hours.byActivity.map((x) => x.hours), 1);
                return (
                  <li key={a.activityId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{a.title}</span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {a.hours} h
                      </span>
                    </div>
                    <Progress value={(a.hours / maxH) * 100} className="h-1.5" />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Class participation */}
      {(instructorClasses.length > 0 || assistantClasses.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-primary" />
              Clases en las que participas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {volunteer.classLinks?.map(({ class: c, role }) => (
                <div
                  key={c.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${role === "instructor" ? "bg-primary/15 text-primary" : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}`}>
                    <GraduationCap className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.school || "—"} · {c.durationHours} h · {formatDate(c.date)}
                    </p>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-[10px] capitalize ${role === "instructor" ? "border-primary/30 text-primary" : "border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300"}`}
                    >
                      {role === "instructor" ? "Instructor" : "Asistente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent hour records */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" />
            Historial de horas ({hours.records.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {hours.records.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin registros"
              description="Aún no tienes horas sociales registradas."
            />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Actividad</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Horas</TableHead>
                    <TableHead className="min-w-[160px]">Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hours.records
                    .slice()
                    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                    .map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(r.date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.activity?.title || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={r.type === "admin"
                              ? "border-graphite-300 text-graphite-700 dark:border-graphite-800 dark:text-graphite-300"
                              : "border-primary/30 text-primary"}
                          >
                            {r.type === "admin" ? "Administrativa" : "De campo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {r.hours}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {r.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function InfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IdCard;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60">
      <Icon className="size-4 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function PerfilSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeader title="Mi Perfil" description="Cargando..." />
      <Card>
        <Skeleton className="h-20 w-full rounded-none" />
        <CardContent className="p-6 -mt-12">
          <div className="flex items-end gap-4">
            <Skeleton className="size-24 rounded-2xl" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
