"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  CalendarDays,
  Scale,
  CalendarRange,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  reportsApi,
  activitiesApi,
  getToken,
  type Activity,
  type PeriodFilter,
} from "@/lib/api";
import { SectionHeader, EmptyState } from "../Shared";

/* ---------- Constants & helpers ---------- */

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const MONTH_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Opciones de mes: valor "01".."12", etiqueta "Enero".."Diciembre". */
const MONTH_OPTIONS = MONTH_NAMES.map((name, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: name,
}));

/** Años disponibles: desde 2023 hasta el año actual + 1. */
function buildYearOptions(): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const options: { value: string; label: string }[] = [];
  for (let y = 2023; y <= currentYear + 1; y++) {
    options.push({ value: String(y), label: String(y) });
  }
  return options;
}
const YEAR_OPTIONS = buildYearOptions();

/** Convierte "YYYY-MM" a "Ene 2025" (para badges), o "…" si no hay. */
function shortMonthLabel(ym?: string): string {
  if (!ym) return "…";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/** Construye un valor "YYYY-MM" a partir de año y mes (índice 1-12). */
function buildYearMonth(year: string, monthIdx: string): string {
  if (!year || !monthIdx) return "";
  return `${year}-${monthIdx}`;
}

/** Texto legible del período para el badge en las tarjetas Excel. */
function periodBadgeLabel(period?: PeriodFilter): string {
  if (!period || (!period.startMonth && !period.endMonth)) {
    return "Todos los períodos";
  }
  return `Filtrado: ${shortMonthLabel(period.startMonth)} – ${shortMonthLabel(
    period.endMonth,
  )}`;
}

/** Compara dos valores "YYYY-MM". Devuelve negativo si a<b, 0 si iguales, positivo si a>b. */
function compareYearMonth(a: string, b: string): number {
  return a.localeCompare(b);
}

interface ReportCard {
  id: "memoria" | "horas" | "balance";
  title: string;
  description: string;
  icon: typeof FileSpreadsheet;
  iconBg: string;
  iconColor: string;
  fallbackFilename: string;
  buttonLabel: string;
  urlBuilder: (period: PeriodFilter | undefined) => string;
}

const EXCEL_REPORTS: ReportCard[] = [
  {
    id: "memoria",
    title: "Memoria de Labores",
    description:
      "Reporte Excel con todas las actividades, voluntarios y horas sociales registradas en el sistema.",
    icon: FileSpreadsheet,
    iconBg: "bg-accent",
    iconColor: "text-primary",
    fallbackFilename: "memoria-de-labores.xlsx",
    buttonLabel: "Descargar Excel",
    urlBuilder: (period) => reportsApi.memoriaLabores(period),
  },
  {
    id: "horas",
    title: "Horas Sociales",
    description:
      "Reporte Excel detallado de horas sociales por voluntario, actividad y tipo (administrativas / campo).",
    icon: FileSpreadsheet,
    iconBg: "bg-graphite-100 dark:bg-graphite-950",
    iconColor: "text-graphite-600 dark:text-graphite-400",
    fallbackFilename: "horas-sociales.xlsx",
    buttonLabel: "Descargar Excel",
    urlBuilder: (period) => reportsApi.horasSociales(period),
  },
  {
    id: "balance",
    title: "Balance Financiero",
    description:
      "Reporte Excel con el balance de ingresos vs egresos, desglose por categoría y hojas separadas para cada tipo de movimiento.",
    icon: Scale,
    iconBg: "bg-rose-100 dark:bg-rose-950",
    iconColor: "text-rose-600 dark:text-rose-400",
    fallbackFilename: "balance-financiero.xlsx",
    buttonLabel: "Descargar Excel",
    urlBuilder: (period) => reportsApi.balanceFinanciero(period),
  },
];

/* ---------- Component ---------- */

export function ReportesSection() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<string>("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // Period filter state — año y mes separados para Desde y Hasta
  const [allPeriods, setAllPeriods] = useState(true); // default: sin filtro
  const [startYear, setStartYear] = useState<string>("");
  const [startMonthIdx, setStartMonthIdx] = useState<string>(""); // "01".."12"
  const [endYear, setEndYear] = useState<string>("");
  const [endMonthIdx, setEndMonthIdx] = useState<string>("");

  const startMonth = buildYearMonth(startYear, startMonthIdx);
  const endMonth = buildYearMonth(endYear, endMonthIdx);

  const period: PeriodFilter | undefined = allPeriods
    ? undefined
    : { startMonth: startMonth || undefined, endMonth: endMonth || undefined };

  const periodBadge = useMemo(() => periodBadgeLabel(period), [period]);

  // Detecta si el rango es inválido (Desde > Hasta) para mostrar advertencia
  const invalidRange = Boolean(
    !allPeriods &&
      startMonth &&
      endMonth &&
      compareYearMonth(startMonth, endMonth) > 0,
  );

  useEffect(() => {
    activitiesApi
      .list()
      .then(setActivities)
      .catch((e: unknown) =>
        toast.error(
          e instanceof Error ? e.message : "Error al cargar actividades",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  /** Descarga un reporte incluyendo el Bearer token y extrayendo el nombre
   *  del archivo del header Content-Disposition cuando el backend lo envía. */
  async function downloadReport(
    url: string,
    id: string,
    fallbackFilename: string,
  ) {
    setDownloading(id);
    try {
      const token = getToken();
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Error ${res.status} al descargar el reporte`);
      }

      // Extraer nombre del archivo del header Content-Disposition si existe.
      // Acepta filename="..." y filename=... (sin comillas).
      const disposition = res.headers.get("content-disposition");
      const filename =
        disposition?.match(/filename="?([^";\n]+)"?/i)?.[1] ??
        fallbackFilename;

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success(`Reporte descargado: ${filename}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al descargar");
    } finally {
      setDownloading(null);
    }
  }

  /** Aplica un preset de período rápido (siempre desactiva "todos"). */
  function applyPreset(
    sy: string,
    sm: string,
    ey: string,
    em: string,
  ) {
    setStartYear(sy);
    setStartMonthIdx(sm);
    setEndYear(ey);
    setEndMonthIdx(em);
    setAllPeriods(false);
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  // Presets rápidos
  const presetThisYear = {
    sy: String(currentYear),
    sm: "01",
    ey: String(currentYear),
    em: "12",
  };
  // Últimos 6 meses (mes actual inclusive, retrocediendo 5)
  const sixMonthsAgo = new Date(currentYear, currentMonth - 5, 1);
  const presetLast6 = {
    sy: String(sixMonthsAgo.getFullYear()),
    sm: String(sixMonthsAgo.getMonth() + 1).padStart(2, "0"),
    ey: String(currentYear),
    em: String(currentMonth + 1).padStart(2, "0"),
  };
  const preset2025 = { sy: "2025", sm: "01", ey: "2025", em: "12" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Reportes"
        description="Descarga documentos oficiales de la asociación"
      />

      {/* Selector de período */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-graphite-500/5">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <CalendarRange className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base flex items-center gap-2">
                Período del reporte
              </CardTitle>
              <CardDescription className="mt-0.5">
                Filtra los reportes Excel (Memoria, Horas y Balance) por rango
                de meses. El documento ODS no se ve afectado.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Label
                htmlFor="all-periods"
                className="text-xs text-muted-foreground cursor-pointer hidden sm:inline"
              >
                Todos los períodos
              </Label>
              <Switch
                id="all-periods"
                checked={allPeriods}
                onCheckedChange={setAllPeriods}
                aria-label="Todos los períodos"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Desde */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-graphite-600 dark:text-graphite-300 flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" />
                Desde
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={startYear}
                  onValueChange={setStartYear}
                  disabled={allPeriods}
                >
                  <SelectTrigger
                    className="w-full h-10"
                    aria-label="Año inicial"
                  >
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {YEAR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={startMonthIdx}
                  onValueChange={setStartMonthIdx}
                  disabled={allPeriods || !startYear}
                >
                  <SelectTrigger
                    className="w-full h-10"
                    aria-label="Mes inicial"
                  >
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {MONTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!allPeriods && startMonth && (
                <p className="text-[11px] text-muted-foreground">
                  Inicio: <span className="text-foreground font-medium">
                    {shortMonthLabel(startMonth)}
                  </span>
                </p>
              )}
            </div>

            {/* Hasta */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-graphite-600 dark:text-graphite-300 flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-primary" />
                Hasta
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={endYear}
                  onValueChange={setEndYear}
                  disabled={allPeriods}
                >
                  <SelectTrigger
                    className="w-full h-10"
                    aria-label="Año final"
                  >
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {YEAR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={endMonthIdx}
                  onValueChange={setEndMonthIdx}
                  disabled={allPeriods || !endYear}
                >
                  <SelectTrigger
                    className="w-full h-10"
                    aria-label="Mes final"
                  >
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {MONTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!allPeriods && endMonth && (
                <p className="text-[11px] text-muted-foreground">
                  Fin: <span className="text-foreground font-medium">
                    {shortMonthLabel(endMonth)}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Advertencia de rango inválido */}
          {invalidRange && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                El mes inicial (<strong>{shortMonthLabel(startMonth)}</strong>)
                es posterior al mes final (<strong>{shortMonthLabel(endMonth)}</strong>).
                Ajusta el rango para que el filtro sea válido.
              </span>
            </div>
          )}

          {/* Presets rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              Presets:
            </span>
            <Button
              type="button"
              size="sm"
              variant={allPeriods ? "outline" : "secondary"}
              className="h-7 text-xs"
              onClick={() =>
                applyPreset(
                  presetThisYear.sy,
                  presetThisYear.sm,
                  presetThisYear.ey,
                  presetThisYear.em,
                )
              }
            >
              Este año
            </Button>
            <Button
              type="button"
              size="sm"
              variant={allPeriods ? "outline" : "secondary"}
              className="h-7 text-xs"
              onClick={() =>
                applyPreset(
                  presetLast6.sy,
                  presetLast6.sm,
                  presetLast6.ey,
                  presetLast6.em,
                )
              }
            >
              Últimos 6 meses
            </Button>
            <Button
              type="button"
              size="sm"
              variant={allPeriods ? "outline" : "secondary"}
              className="h-7 text-xs"
              onClick={() =>
                applyPreset(
                  preset2025.sy,
                  preset2025.sm,
                  preset2025.ey,
                  preset2025.em,
                )
              }
            >
              2025 completo
            </Button>
            {!allPeriods && (
              <Badge
                variant="outline"
                className="text-[10px] bg-primary/10 text-primary border-primary/30"
              >
                {periodBadge}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Grid de reportes */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 3 reportes Excel */}
        {EXCEL_REPORTS.map((report, idx) => {
          const Icon = report.icon;
          const isDownloading = downloading === report.id;
          return (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 * idx }}
            >
              <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`size-12 rounded-xl ${report.iconBg} flex items-center justify-center mb-2`}
                    >
                      <Icon className={`size-6 ${report.iconColor}`} />
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium ${
                        allPeriods
                          ? "bg-muted text-muted-foreground border-muted-foreground/20"
                          : "bg-primary/10 text-primary border-primary/30"
                      }`}
                      title={periodBadge}
                    >
                      <CalendarDays className="size-3" />
                      <span className="truncate max-w-[140px]">
                        {periodBadge}
                      </span>
                    </Badge>
                  </div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() =>
                      downloadReport(
                        report.urlBuilder(period),
                        report.id,
                        report.fallbackFilename,
                      )
                    }
                    disabled={isDownloading || invalidRange}
                  >
                    {isDownloading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {report.buttonLabel}
                  </Button>
                  {invalidRange && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 text-center mt-2">
                      Corrige el rango de fechas para descargar
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}

        {/* ODS Project — siempre requiere actividad seleccionada */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Card className="flex flex-col h-full hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="size-12 rounded-xl bg-sky-100 dark:bg-sky-950 flex items-center justify-center mb-2">
                <FileText className="size-6 text-sky-600 dark:text-sky-400" />
              </div>
              <CardTitle className="text-base">
                Plantilla de Proyecto ODS
              </CardTitle>
              <CardDescription>
                Documento Word con la plantilla oficial de proyecto ODS,
                generado con los datos de la actividad seleccionada.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              {loading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="r-activity"
                    className="text-xs font-medium text-graphite-600 dark:text-graphite-300"
                  >
                    Proyecto (actividad)
                  </Label>
                  <Select
                    value={selectedActivity}
                    onValueChange={setSelectedActivity}
                  >
                    <SelectTrigger id="r-activity" className="w-full h-9">
                      <span className="flex items-center gap-2 truncate">
                        <CalendarDays className="size-3.5 text-muted-foreground" />
                        <SelectValue placeholder="Selecciona un proyecto" />
                      </span>
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {activities.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No hay actividades registradas
                        </div>
                      ) : (
                        activities.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.title}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-snug">
                    <Info className="size-3 shrink-0 mt-0.5" />
                    El documento se genera con los datos del proyecto
                    seleccionado y se guarda también en el servidor.
                  </p>
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Span intermedio para que el tooltip funcione aun con el
                      botón deshabilitado (un button disabled no recibe hover). */}
                  <span className="block w-full">
                    <Button
                      className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={() => {
                        if (!selectedActivity) return;
                        const url = reportsApi.odsProject(selectedActivity);
                        downloadReport(url, "ods", "proyecto-ods.docx");
                      }}
                      disabled={
                        downloading === "ods" ||
                        loading ||
                        !selectedActivity ||
                        activities.length === 0
                      }
                    >
                      {downloading === "ods" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Descargar Word
                    </Button>
                  </span>
                </TooltipTrigger>
                {(!selectedActivity || activities.length === 0) && !loading && (
                  <TooltipContent side="bottom" className="max-w-[240px]">
                    {activities.length === 0
                      ? "No hay proyectos registrados todavía"
                      : "Selecciona un proyecto primero"}
                  </TooltipContent>
                )}
              </Tooltip>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {activities.length === 0 && !loading && (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={FileSpreadsheet}
              title="Sin proyectos para reporte ODS"
              description="Crea actividades para poder generar reportes de proyecto ODS con datos."
            />
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
