"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Check,
  X,
  Loader2,
  Hourglass,
  CheckCircle2,
  XCircle,
  FileText,
  CalendarClock,
  MessageSquare,
  Inbox,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  hourRequestsApi,
  activitiesApi,
  volunteersApi,
  formatDate,
  isPrivileged,
  type HourRequest,
  type HourRequestStatus,
  type Activity,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState } from "../Shared";
import { cn } from "@/lib/utils";

/**
 * SolicitudesHorasSection
 * ------------------------
 * Vista combinada de solicitudes de horas adicionales.
 *
 * - Todos los usuarios pueden ver sus propias solicitudes y crear nuevas.
 * - Usuarios privilegiados (admin, committee_leader, president, vice_president)
 *   ven además una pestaña "Pendientes" para aprobar / rechazar solicitudes
 *   de cualquier voluntario.
 */
export function SolicitudesHorasSection() {
  const { user } = useAuthStore();
  const privileged = isPrivileged(user?.role);

  const [mine, setMine] = useState<HourRequest[]>([]);
  const [pending, setPending] = useState<HourRequest[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentHours, setCurrentHours] = useState(0);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Review flows (privileged)
  const [approveTarget, setApproveTarget] = useState<HourRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<HourRequest | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function loadMine() {
    try {
      const [mineReq, acts] = await Promise.all([
        hourRequestsApi.mine(),
        activitiesApi.mine().catch(() => [] as Activity[]),
      ]);
      setMine(mineReq);
      setActivities(acts);
      if (user?.id) {
        try {
          const h = await volunteersApi.hours(user.id);
          setCurrentHours(h.totalHours ?? 0);
        } catch {
          setCurrentHours(0);
        }
      }
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al cargar tus solicitudes",
      );
    }
  }

  async function loadPending() {
    if (!privileged) return;
    try {
      const p = await hourRequestsApi.list("pending");
      setPending(p);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al cargar pendientes",
      );
    }
  }

  async function load() {
    setLoading(true);
    await Promise.all([loadMine(), loadPending()]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [user?.id]);

  async function handleCreate(data: {
    activityId: string | null;
    currentHours: number;
    requestedHours: number;
    reason: string;
  }) {
    setSubmitting(true);
    try {
      await hourRequestsApi.create({
        activityId: data.activityId,
        currentHours: data.currentHours,
        requestedHours: data.requestedHours,
        reason: data.reason,
      });
      toast.success("Solicitud enviada");
      setFormOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al crear la solicitud",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string, approvedHours: number) {
    setReviewing(true);
    try {
      await hourRequestsApi.approve(id, approvedHours);
      toast.success(`Solicitud aprobada · +${approvedHours}h`);
      setApproveTarget(null);
      await load();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al aprobar la solicitud",
      );
    } finally {
      setReviewing(false);
    }
  }

  async function handleReject(id: string, notes: string) {
    setReviewing(true);
    try {
      await hourRequestsApi.reject(id, notes);
      toast.success("Solicitud rechazada");
      setRejectTarget(null);
      await load();
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al rechazar la solicitud",
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Solicitudes de Horas"
        description="Pide horas adicionales o revisa solicitudes pendientes"
        action={
          <Button
            onClick={() => setFormOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
          >
            <Plus className="size-4" /> Nueva solicitud
          </Button>
        }
      />

      <Tabs defaultValue="mine">
        <TabsList
          className={cn(
            "grid w-full",
            privileged ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <TabsTrigger value="mine" className="gap-1.5">
            <ClipboardList className="size-3.5" />
            Mis solicitudes
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] h-4 px-1.5 tabular-nums"
            >
              {mine.length}
            </Badge>
          </TabsTrigger>
          {privileged && (
            <TabsTrigger value="pending" className="gap-1.5">
              <Inbox className="size-3.5" />
              Pendientes de revisión
              <Badge
                className="ml-1 text-[10px] h-4 px-1.5 tabular-nums bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              >
                {pending.length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============ Mis solicitudes ============ */}
        <TabsContent value="mine" className="mt-4 space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : mine.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={FileText}
                  title="No tienes solicitudes de horas"
                  description="Cuando necesites más horas sociales, crea una solicitud con el botón “Nueva solicitud”. Te notificaremos al revisarse."
                  action={
                    <Button
                      onClick={() => setFormOpen(true)}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <Plus className="size-4" /> Crear primera solicitud
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto scroll-thin space-y-3 pr-1">
              {mine.map((req, i) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                >
                  <OwnRequestCard request={req} currentHours={currentHours} />
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ Pendientes de revisión ============ */}
        {privileged && (
          <TabsContent value="pending" className="mt-4 space-y-3">
            {loading ? (
              <Card>
                <CardContent className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : pending.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={CheckCircle2}
                    title="No hay solicitudes pendientes"
                    description="Todas las solicitudes de horas adicionales han sido revisadas. Buen trabajo."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="max-h-[36rem] overflow-y-auto scroll-thin space-y-3 pr-1">
                {pending.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                  >
                    <PendingRequestCard
                      request={req}
                      onApprove={() => setApproveTarget(req)}
                      onReject={() => setRejectTarget(req)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ============ Dialogs ============ */}
      <NewHourRequestDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        activities={activities}
        currentHours={currentHours}
        submitting={submitting}
        onSubmit={handleCreate}
      />

      <ApproveRequestDialog
        request={approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
        submitting={reviewing}
        onConfirm={(hours) => {
          if (approveTarget) handleApprove(approveTarget.id, hours);
        }}
      />

      <RejectRequestDialog
        request={rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        submitting={reviewing}
        onConfirm={(notes) => {
          if (rejectTarget) handleReject(rejectTarget.id, notes);
        }}
      />
    </motion.div>
  );
}

/* =================================================================== */
/* Status badge helper                                                  */
/* =================================================================== */

function StatusBadge({
  status,
  approvedHours,
  className,
}: {
  status: HourRequestStatus;
  approvedHours?: number | null;
  className?: string;
}) {
  switch (status) {
    case "pending":
      return (
        <Badge
          className={cn(
            "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
            className,
          )}
        >
          <Hourglass className="size-3 mr-1" />
          Pendiente
        </Badge>
      );
    case "approved":
      return (
        <Badge
          className={cn(
            "bg-primary/15 text-primary border-primary/30",
            className,
          )}
        >
          <CheckCircle2 className="size-3 mr-1" />
          Aprobada · +{approvedHours ?? 0}h
        </Badge>
      );
    case "rejected":
      return (
        <Badge
          className={cn(
            "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
            className,
          )}
        >
          <XCircle className="size-3 mr-1" />
          Rechazada
        </Badge>
      );
  }
}

/* =================================================================== */
/* Own request card — for the "Mis solicitudes" tab                     */
/* =================================================================== */

function OwnRequestCard({
  request,
  currentHours,
}: {
  request: HourRequest;
  currentHours: number;
}) {
  const activityTitle =
    request.activity?.title ?? "Sin actividad vinculada";
  return (
    <Card className="ring-1 ring-border/60 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge
                status={request.status}
                approvedHours={request.approvedHours}
              />
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                {formatDate(request.createdAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Horas actuales
            </p>
            <p className="font-semibold tabular-nums">
              {request.currentHours}h
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Solicitadas
            </p>
            <p className="font-semibold tabular-nums text-primary">
              +{request.requestedHours}h
            </p>
          </div>
          {request.status === "approved" && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Aprobadas
              </p>
              <p className="font-semibold tabular-nums text-primary">
                +{request.approvedHours ?? request.requestedHours}h
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Actividad
            </p>
            <p className="font-medium truncate" title={activityTitle}>
              {activityTitle}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 border border-border/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            Motivo
          </p>
          <p className="text-sm leading-relaxed">{request.reason}</p>
        </div>

        {request.status === "rejected" && request.reviewNotes && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-3">
            <p className="text-[10px] uppercase tracking-wide text-rose-700 dark:text-rose-300 mb-1 inline-flex items-center gap-1">
              <XCircle className="size-3" />
              Motivo del rechazo
              {request.reviewer?.name && (
                <span className="normal-case font-normal text-rose-600/80 dark:text-rose-400/80">
                  · {request.reviewer.name}
                </span>
              )}
            </p>
            <p className="text-sm leading-relaxed text-rose-900 dark:text-rose-100">
              {request.reviewNotes}
            </p>
          </div>
        )}

        {request.status === "approved" && request.reviewer?.name && (
          <p className="text-xs text-muted-foreground">
            Revisada por{" "}
            <span className="font-medium text-foreground">
              {request.reviewer.name}
            </span>
            {request.reviewedAt && (
              <> · {formatDate(request.reviewedAt)}</>
            )}
          </p>
        )}

        {request.status === "pending" && (
          <p className="text-xs text-muted-foreground">
            Tu solicitud está siendo revisada por un líder o presidente. Te
            notificaremos al resolverse.
          </p>
        )}

        {/* Hint to track currentHours delta */}
        {currentHours !== request.currentHours && (
          <p className="text-[10px] text-muted-foreground">
            Tus horas actuales son ahora <strong>{currentHours}h</strong> (al
            crear la solicitud tenías {request.currentHours}h).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* =================================================================== */
/* Pending request card — for the "Pendientes" tab (privileged)         */
/* =================================================================== */

function PendingRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: HourRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const vol = request.volunteer;
  const activityTitle =
    request.activity?.title ?? "Sin actividad vinculada";
  const committeeName = vol?.committee?.name;

  return (
    <Card className="ring-1 ring-amber-300/40 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-4 space-y-3">
        {/* Volunteer row */}
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {(vol?.name ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold truncate">
                {vol?.name ?? "Voluntario"}
              </p>
              {vol?.studentId && (
                <span className="text-xs text-muted-foreground font-mono">
                  {vol.studentId}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {committeeName && (
                <Badge
                  variant="secondary"
                  className="text-[10px] h-4 px-1.5"
                >
                  {committeeName}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                Solicitado {formatDate(request.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Actuales
            </p>
            <p className="font-semibold tabular-nums">
              {request.currentHours}h
            </p>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-primary">
              Solicitadas
            </p>
            <p className="font-semibold tabular-nums text-primary">
              +{request.requestedHours}h
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 border border-border/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Actividad
            </p>
            <p className="font-medium text-xs truncate" title={activityTitle}>
              {activityTitle}
            </p>
          </div>
        </div>

        {/* Reason */}
        <div className="rounded-lg bg-muted/40 border border-border/60 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            Motivo del voluntario
          </p>
          <p className="text-sm leading-relaxed">{request.reason}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            onClick={onApprove}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Check className="size-4" /> Aprobar
          </Button>
          <Button
            onClick={onReject}
            variant="outline"
            className="flex-1 text-rose-700 border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-950/40"
          >
            <X className="size-4" /> Rechazar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* =================================================================== */
/* New request dialog                                                   */
/* =================================================================== */

interface NewHourRequestData {
  activityId: string | null;
  currentHours: number;
  requestedHours: number;
  reason: string;
}

function NewHourRequestDialog({
  open,
  onOpenChange,
  activities,
  currentHours,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activities: Activity[];
  currentHours: number;
  submitting: boolean;
  onSubmit: (data: NewHourRequestData) => void | Promise<void>;
}) {
  const [activityId, setActivityId] = useState<string>("none");
  const [requestedHours, setRequestedHours] = useState<string>("1");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open) {
      setActivityId("none");
      setRequestedHours("1");
      setReason("");
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(requestedHours);
    if (isNaN(h) || h < 0.5) {
      toast.error("Las horas solicitadas deben ser al menos 0.5");
      return;
    }
    const r = reason.trim();
    if (r.length < 3) {
      toast.error("El motivo debe tener al menos 3 caracteres");
      return;
    }
    if (r.length > 500) {
      toast.error("El motivo no puede exceder 500 caracteres");
      return;
    }
    onSubmit({
      activityId: activityId === "none" ? null : activityId,
      currentHours,
      requestedHours: h,
      reason: r,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva solicitud de horas</DialogTitle>
          <DialogDescription>
            Solicita horas sociales adicionales. Un líder o presidente revisará
            tu petición.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shr-act">Actividad (opcional)</Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger id="shr-act" className="w-full">
                <SelectValue placeholder="Sin actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  Sin actividad vinculada
                </SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activities.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No estás inscrito en actividades. Puedes crear la solicitud sin
                vincular una.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shr-current">Horas actuales</Label>
              <Input
                id="shr-current"
                type="number"
                value={String(currentHours)}
                disabled
                readOnly
                className="bg-muted/50 tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground">
                Total acumulado de horas aprobadas.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shr-req">Horas adicionales</Label>
              <Input
                id="shr-req"
                type="number"
                min="0.5"
                step="0.5"
                value={requestedHours}
                onChange={(e) => setRequestedHours(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-[10px] text-muted-foreground">
                Mínimo 0.5h.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shr-reason">
              Motivo{" "}
              <span className="text-muted-foreground font-normal">
                ({reason.length}/500)
              </span>
            </Label>
            <Textarea
              id="shr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Explica brevemente por qué solicitas estas horas adicionales..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Enviar solicitud
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =================================================================== */
/* Approve dialog — allows adjusting approved hours                     */
/* =================================================================== */

function ApproveRequestDialog({
  request,
  onOpenChange,
  submitting,
  onConfirm,
}: {
  request: HourRequest | null;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onConfirm: (approvedHours: number) => void | Promise<void>;
}) {
  const defaultHours = request?.requestedHours ?? 1;
  const [approvedHours, setApprovedHours] = useState<string>(
    String(defaultHours),
  );

  useEffect(() => {
    if (request) {
      setApprovedHours(String(request.requestedHours));
    }
  }, [request]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(approvedHours);
    if (isNaN(h) || h < 0.5) {
      toast.error("Las horas aprobadas deben ser al menos 0.5");
      return;
    }
    onConfirm(h);
  }

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" />
            Aprobar solicitud
          </DialogTitle>
          <DialogDescription>
            {request?.volunteer?.name ? (
              <>
                Vas a aprobar la solicitud de{" "}
                <strong>{request.volunteer.name}</strong>. Puedes ajustar las
                horas aprobadas si lo consideras necesario.
              </>
            ) : (
              "Confirma la aprobación de esta solicitud."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {request && (
            <div className="rounded-lg bg-muted/40 border border-border/60 p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horas solicitadas</span>
                <span className="font-semibold tabular-nums">
                  {request.requestedHours}h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horas actuales</span>
                <span className="font-semibold tabular-nums">
                  {request.currentHours}h
                </span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="shr-approved">Horas a aprobar</Label>
            <Input
              id="shr-approved"
              type="number"
              min="0.5"
              step="0.5"
              value={approvedHours}
              onChange={(e) => setApprovedHours(e.target.value)}
              className="tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Se creará automáticamente una hora social aprobada por esta
              cantidad.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              <Check className="size-4" /> Confirmar aprobación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =================================================================== */
/* Reject dialog — asks for review notes                                */
/* =================================================================== */

function RejectRequestDialog({
  request,
  onOpenChange,
  submitting,
  onConfirm,
}: {
  request: HourRequest | null;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onConfirm: (notes: string) => void | Promise<void>;
}) {
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (request) {
      setNotes("");
    }
  }, [request]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = notes.trim();
    if (n.length > 0 && n.length < 3) {
      toast.error("Las notas deben tener al menos 3 caracteres");
      return;
    }
    onConfirm(n);
  }

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-rose-600" />
            Rechazar solicitud
          </DialogTitle>
          <DialogDescription>
            {request?.volunteer?.name ? (
              <>
                Vas a rechazar la solicitud de{" "}
                <strong>{request.volunteer.name}</strong>. Explica el motivo
                para que el voluntario lo entienda.
              </>
            ) : (
              "Explica el motivo del rechazo."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shr-notes">
              Notas de revisión{" "}
              <span className="text-muted-foreground font-normal">
                ({notes.length}/500)
              </span>
            </Label>
            <Textarea
              id="shr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Motivo del rechazo (opcional pero recomendado)..."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="text-rose-700 border-rose-300 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-950/40"
              disabled={submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              <X className="size-4" /> Confirmar rechazo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
