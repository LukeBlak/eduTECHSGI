"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Database,
  Search,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Users2,
  CalendarDays,
  Trophy,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminApi,
  type OrphanAuditReport,
  type OrphanCleanupResult,
} from "@/lib/api";

/**
 * AdminMaintenanceCard — Tarjeta de mantenimiento de datos para roles
 * privilegiados (admin, presidente, vice_presidente, líder de comité).
 *
 * Expone dos acciones:
 *  1. Auditar: llama a GET /api/admin/cleanup-orphans y muestra un
 *     reporte de cuántos docs huérfanos hay (sin borrar nada).
 *  2. Limpiar: llama a POST /api/admin/cleanup-orphans (con confirmación
 *     previa) y borra los docs huérfanos de las colecciones de join.
 *
 * Esto resuelve el problema de que Firestore no tiene FK CASCADE:
 * cuando se borran clases/actividades/logros/voluntarios por medios
 * externos a la UI (consola Firestore, scripts legacy, mock-data
 * inicial), los docs en classVolunteers/activityVolunteers/
 * volunteerAchievements quedan apuntando a IDs inexistentes. Esta
 * tarjeta permite al admin limpiarlos sin tener que correr fetch
 * commands en la consola del browser (que era propenso a errores
 * como el 401 por usar la key equivocada del localStorage).
 */
export function AdminMaintenanceCard() {
  const [audit, setAudit] = useState<OrphanAuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<OrphanCleanupResult | null>(null);

  async function handleAudit() {
    setAuditing(true);
    try {
      const report = await adminApi.auditOrphans();
      setAudit(report);
      const total =
        report.orphansFound.classVolunteers +
        report.orphansFound.activityVolunteers +
        report.orphansFound.volunteerAchievements;
      if (total === 0) {
        toast.success("Sin huérfanos", {
          description: "Todas las colecciones de join están consistentes.",
        });
      } else {
        toast.info("Auditoría completada", {
          description: `Se encontraron ${total} documento(s) huérfano(s).`,
        });
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al auditar huérfanos",
      );
    } finally {
      setAuditing(false);
    }
  }

  async function handleCleanup() {
    setConfirmOpen(false);
    setCleaning(true);
    try {
      const result = await adminApi.cleanupOrphans();
      setLastResult(result);
      setAudit(null); // invalidar audit previo
      const total =
        result.deleted.classVolunteers +
        result.deleted.activityVolunteers +
        result.deleted.volunteerAchievements;
      toast.success("Limpieza completada", {
        description: `${total} documento(s) huérfano(s) eliminado(s).`,
      });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al limpiar huérfanos",
      );
    } finally {
      setCleaning(false);
    }
  }

  const totalOrphans = audit
    ? audit.orphansFound.classVolunteers +
      audit.orphansFound.activityVolunteers +
      audit.orphansFound.volunteerAchievements
    : 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="ring-1 ring-amber-500/15 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="size-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Database className="size-4" />
              </div>
              Mantenimiento de datos
              {totalOrphans > 0 && (
                <Badge
                  variant="outline"
                  className="text-amber-700 border-amber-300 bg-amber-100/60 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40"
                >
                  <AlertTriangle className="size-3 mr-1" />
                  {totalOrphans} huérfanos
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Firestore no tiene <span className="font-medium">foreign keys</span>{" "}
              ni <span className="font-medium">CASCADE</span>. Cuando se
              borran clases, actividades, logros o voluntarios por medios
              externos a la app (consola Firestore directa, scripts legacy),
              los documentos en las colecciones de join (
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                classVolunteers
              </code>
              ,{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                activityVolunteers
              </code>
              ,{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                volunteerAchievements
              </code>
              ) pueden quedar apuntando a IDs inexistentes. Esta herramienta
              los detecta y los borra.
            </p>

            {/* Resultado de auditoría o limpieza */}
            {(audit || lastResult) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <OrphanStatCard
                  icon={Users2}
                  label="classVolunteers"
                  scanned={audit?.scanned.classVolunteers ?? 0}
                  orphans={
                    audit?.orphansFound.classVolunteers ??
                    lastResult?.deleted.classVolunteers ??
                    0
                  }
                  done={!!lastResult}
                />
                <OrphanStatCard
                  icon={CalendarDays}
                  label="activityVolunteers"
                  scanned={audit?.scanned.activityVolunteers ?? 0}
                  orphans={
                    audit?.orphansFound.activityVolunteers ??
                    lastResult?.deleted.activityVolunteers ??
                    0
                  }
                  done={!!lastResult}
                />
                <OrphanStatCard
                  icon={Trophy}
                  label="volunteerAchievements"
                  scanned={audit?.scanned.volunteerAchievements ?? 0}
                  orphans={
                    audit?.orphansFound.volunteerAchievements ??
                    lastResult?.deleted.volunteerAchievements ??
                    0
                  }
                  done={!!lastResult}
                />
              </div>
            )}

            {lastResult && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {lastResult.message}
                </p>
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleAudit}
                disabled={auditing || cleaning}
                className="flex-1"
              >
                {auditing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Auditar huérfanos
              </Button>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={
                  cleaning ||
                  auditing ||
                  (audit !== null && totalOrphans === 0)
                }
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white border-amber-600/20"
              >
                {cleaning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Limpiar huérfanos
              </Button>
            </div>

            {/* Hint si no se ha auditado */}
            {!audit && !lastResult && (
              <p className="text-[11px] text-muted-foreground/70 text-center">
                Tip: audita primero para ver cuántos hay antes de borrar.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Diálogo de confirmación antes de borrar */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Confirmar limpieza
            </DialogTitle>
            <DialogDescription>
              Se borrarán permanentemente los documentos huérfanos de las
              colecciones de join. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {audit && (
            <div className="space-y-2 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">classVolunteers:</span>
                <span className="font-semibold tabular-nums">
                  {audit.orphansFound.classVolunteers} huérfanos
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  activityVolunteers:
                </span>
                <span className="font-semibold tabular-nums">
                  {audit.orphansFound.activityVolunteers} huérfanos
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  volunteerAchievements:
                </span>
                <span className="font-semibold tabular-nums">
                  {audit.orphansFound.volunteerAchievements} huérfanos
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Total a borrar:</span>
                <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {totalOrphans}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={cleaning}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCleanup}
              disabled={cleaning || totalOrphans === 0}
              className="bg-amber-500 hover:bg-amber-600 text-white border-amber-600/20"
            >
              {cleaning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Borrar {totalOrphans} huérfano(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OrphanStatCard({
  icon: Icon,
  label,
  scanned,
  orphans,
  done,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  scanned: number;
  orphans: number;
  done: boolean;
}) {
  const hasOrphans = orphans > 0;
  return (
    <div
      className={`rounded-lg border p-3 ${
        hasOrphans
          ? "border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/15"
          : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/15"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-xl font-bold tabular-nums ${
            hasOrphans
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {orphans}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {done ? "borrados" : "huérfanos"}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        de {scanned} escaneados
      </p>
    </div>
  );
}
