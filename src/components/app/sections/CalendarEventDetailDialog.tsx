"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  GraduationCap,
  Clock,
  Users,
  MapPin,
  School,
  Tag,
  FileText,
  CheckCircle2,
  Loader2,
  Building2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  classesApi,
  committeeColorClass,
  formatDate,
  type ClassItem,
} from "@/lib/api";
import { ActivityDetailDialog } from "./ActivityDetailDialog";
import { cn } from "@/lib/utils";

/**
 * Evento del calendario (versión resumida). Se reutiliza el tipo definido en
 * CalendarioSection pero aquí lo definimos localmente para evitar dependencias
 * circulares — el shape es idéntico.
 */
export type CalEvent = {
  id: string;
  kind: "activity" | "class";
  title: string;
  date: string;
  location?: string;
  hours: number;
  participants: number;
  committee?: { id: string; name: string; color?: string | null } | null;
  meta?: string;
};

interface CalendarEventDetailDialogProps {
  event: CalEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo de detalle para un evento del calendario.
 *
 * - Si el evento es una **actividad**, delega al `ActivityDetailDialog` existente
 *   (que carga voluntarios inscritos, gastos, objetivos, impacto, ODS, etc.).
 * - Si el evento es una **clase**, muestra un diálogo propio con todos los datos
 *   de la clase (título, fecha, duración, escuela, tema, descripción,
 *   instructores, comité, estado).
 *
 * Esto permite que al hacer clic en cualquier evento del calendario (en la
 * celda del día, en el sidebar del día seleccionado, en próximos eventos o en
 * la línea de tiempo) se abra la vista de detalle completa.
 */
export function CalendarEventDetailDialog({
  event,
  open,
  onOpenChange,
}: CalendarEventDetailDialogProps) {
  // Para las clases necesitamos cargar el registro completo (con instructores).
  // Para las actividades, ActivityDetailDialog carga todo internamente.
  const [classDetail, setClassDetail] = useState<ClassItem | null>(null);
  const [loadingClass, setLoadingClass] = useState(false);

  useEffect(() => {
    if (!open || !event || event.kind !== "class") {
      setClassDetail(null);
      setLoadingClass(false);
      return;
    }
    let cancelled = false;
    setLoadingClass(true);
    // Buscamos la clase por id dentro del listado (no hay endpoint get individual).
    classesApi
      .list()
      .then((all) => {
        if (cancelled) return;
        const found = all.find((c) => c.id === event.id) ?? null;
        setClassDetail(found);
      })
      .catch(() => {
        if (!cancelled) setClassDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingClass(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, event]);

  // Si es actividad, delegar al ActivityDetailDialog existente.
  if (event?.kind === "activity") {
    return (
      <ActivityDetailDialog
        // Construimos un objeto Activity mínimo con el id; ActivityDetailDialog
        // carga internamente el detalle completo con activitiesApi.get(id).
        activity={
          {
            id: event.id,
            title: event.title,
            hours: event.hours,
            location: event.location,
            beneficiariesMen: 0,
            beneficiariesWomen: 0,
            ods: [],
            committee: event.committee ?? null,
          } as never
        }
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  // Si es clase, mostrar diálogo propio.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <span
              className={cn(
                "size-10 rounded-lg flex items-center justify-center shrink-0",
                "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
              )}
            >
              <GraduationCap className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg leading-tight">{event?.title ?? "Clase"}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge
                  variant="secondary"
                  className="text-[10px] h-5 bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                >
                  Clase
                </Badge>
                {classDetail?.status === "completed" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 gap-1"
                  >
                    <CheckCircle2 className="size-3" />
                    Finalizada
                  </Badge>
                )}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalle de la clase
          </DialogDescription>
        </DialogHeader>

        {loadingClass ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !classDetail ? (
          <div className="py-8 text-center">
            <Loader2 className="size-6 text-muted-foreground/50 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">
              No se pudo cargar la clase.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Meta rápida */}
            <div className="grid grid-cols-2 gap-2.5">
              <MetaCard
                icon={<CalendarDays className="size-4" />}
                label="Fecha"
                value={classDetail.date ? formatDate(classDetail.date) : "Sin fecha"}
              />
              <MetaCard
                icon={<Clock className="size-4" />}
                label="Duración"
                value={`${classDetail.durationHours}h`}
              />
              {classDetail.school && (
                <MetaCard
                  icon={<School className="size-4" />}
                  label="Escuela"
                  value={classDetail.school}
                />
              )}
              {classDetail.topic && (
                <MetaCard
                  icon={<Tag className="size-4" />}
                  label="Tema"
                  value={classDetail.topic}
                />
              )}
              {classDetail.committee && (
                <MetaCard
                  icon={<Building2 className="size-4" />}
                  label="Comité"
                  value={classDetail.committee.name}
                />
              )}
              <MetaCard
                icon={<Users className="size-4" />}
                label="Instructores"
                value={`${classDetail.instructors?.length ?? 0}`}
              />
            </div>

            {/* Descripción */}
            {classDetail.description && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <FileText className="size-3" />
                  Descripción
                </p>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                  {classDetail.description}
                </p>
              </div>
            )}

            {/* Instructores */}
            {classDetail.instructors && classDetail.instructors.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Users className="size-3" />
                  Instructores ({classDetail.instructors.length})
                </p>
                <div className="space-y-1.5">
                  {classDetail.instructors.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2.5 rounded-md border bg-background px-2.5 py-2"
                    >
                      <span className="size-7 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 flex items-center justify-center text-xs font-semibold shrink-0">
                        {v.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{v.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {v.studentId}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ubicación (si existiera en el evento) */}
            {event?.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                <span>{event.location}</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 mb-0.5">
        {icon}
        {label}
      </p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}
