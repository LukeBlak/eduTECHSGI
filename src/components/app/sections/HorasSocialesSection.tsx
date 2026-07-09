"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Clock,
  Loader2,
  Briefcase,
  MapPin,
  Filter,
  X,
  Search,
  Check,
  Hourglass,
  CheckCircle2,
  XCircle,
  Info,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  socialHoursApi,
  volunteersApi,
  activitiesApi,
  formatDate,
  isPrivileged,
  type SocialHour,
  type Volunteer,
  type Activity,
  type HourType,
  type ApprovalStatus,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight } from "../Shared";
import { cn } from "@/lib/utils";

type ApprovalFilter = "all" | ApprovalStatus;

export function HorasSocialesSection() {
  const { user } = useAuthStore();
  const privileged = isPrivileged(user?.role);
  const [hours, setHours] = useState<SocialHour[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [volunteerFilter, setVolunteerFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SocialHour | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialHour | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pending review (privileged)
  const [pendingHours, setPendingHours] = useState<SocialHour[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<SocialHour | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      // RBAC en cliente: los voluntarios solo ven SUS propias horas y NO
      // necesitan (ni deben) descargar la lista completa de voluntarios.
      // Para roles privilegiados se mantiene el comportamiento de admin.
      if (privileged && user) {
        const [hs, vols, acts] = await Promise.all([
          socialHoursApi.list(
            undefined,
            approvalFilter === "all" ? undefined : approvalFilter,
          ),
          volunteersApi.list(),
          activitiesApi.list(),
        ]);
        setHours(hs);
        setVolunteers(vols);
        setActivities(acts);
      } else if (user) {
        const [hs, acts] = await Promise.all([
          socialHoursApi.list(
            user.id,
            approvalFilter === "all" ? undefined : approvalFilter,
          ),
          activitiesApi.list(),
        ]);
        setHours(hs);
        // Solo el propio usuario: suficiente para mostrar su nombre/carnet.
        setVolunteers([user]);
        setActivities(acts);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar horas");
    } finally {
      setLoading(false);
    }
  }

  async function loadPending() {
    if (!privileged) return;
    setPendingLoading(true);
    try {
      const p = await socialHoursApi.list(undefined, "pending");
      setPendingHours(p);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Error al cargar horas pendientes",
      );
    } finally {
      setPendingLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [approvalFilter, privileged, user?.id]);

  useEffect(() => {
    loadPending();
  }, [privileged]);

  const filtered = useMemo(() => {
    let list = hours;
    if (volunteerFilter !== "all") {
      list = list.filter((h) => h.volunteerId === volunteerFilter);
    }
    if (typeFilter !== "all") {
      list = list.filter((h) => h.type === typeFilter);
    }
    if (fromDate) {
      list = list.filter((h) => !h.date || h.date.slice(0, 10) >= fromDate);
    }
    if (toDate) {
      list = list.filter((h) => !h.date || h.date.slice(0, 10) <= toDate);
    }
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(searchTerm.trim());
    if (q) {
      list = list.filter((h) => {
        const volName = norm(
          volunteers.find((v) => v.id === h.volunteerId)?.name || "",
        );
        const actTitle = norm(
          activities.find((a) => a.id === h.activityId)?.title ||
            "registro manual",
        );
        const notes = norm(h.notes || "");
        return volName.includes(q) || actTitle.includes(q) || notes.includes(q);
      });
    }
    return list;
  }, [
    hours,
    volunteerFilter,
    typeFilter,
    fromDate,
    toDate,
    searchTerm,
    volunteers,
    activities,
  ]);

  const activeFilterCount =
    (volunteerFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (approvalFilter !== "all" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (searchTerm ? 1 : 0);

  function clearFilters() {
    setVolunteerFilter("all");
    setTypeFilter("all");
    setApprovalFilter("all");
    setFromDate("");
    setToDate("");
    setSearchTerm("");
  }

  function applyPreset(preset: "month" | "quarter" | "year") {
    const now = new Date();
    let start: Date;
    if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === "quarter") {
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
  }

  const totals = useMemo(() => {
    const admin = filtered
      .filter((h) => h.type === "admin")
      .reduce((s, h) => s + h.hours, 0);
    const field = filtered
      .filter((h) => h.type === "field")
      .reduce((s, h) => s + h.hours, 0);
    return { admin, field, total: admin + field };
  }, [filtered]);

  const volName = (id: string) =>
    volunteers.find((v) => v.id === id)?.name ||
    (user && user.id === id ? user.name : "—");
  const volCarnet = (id: string) =>
    volunteers.find((v) => v.id === id)?.studentId ||
    (user && user.id === id ? user.studentId : "");
  const actTitle = (id?: string | null) =>
    activities.find((a) => a.id === id)?.title || "Registro manual";

  async function handleDelete(h: SocialHour) {
    try {
      await socialHoursApi.remove(h.id);
      toast.success("Registro eliminado");
      setDeleteTarget(null);
      loadAll();
      loadPending();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function handleApproveHour(h: SocialHour) {
    setReviewing(true);
    try {
      await socialHoursApi.approve(h.id);
      toast.success(`${h.hours}h aprobada`);
      loadAll();
      loadPending();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al aprobar");
    } finally {
      setReviewing(false);
    }
  }

  async function handleRejectHour(h: SocialHour, reason: string) {
    setReviewing(true);
    try {
      await socialHoursApi.reject(h.id, reason);
      toast.success("Hora rechazada");
      setRejectTarget(null);
      loadAll();
      loadPending();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al rechazar");
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
        title="Horas Sociales"
        description={
          privileged
            ? `${filtered.length} de ${hours.length} registro(s) · ${totals.total} hora(s) totales`
            : `Mis horas sociales · ${filtered.length} registro(s) · ${totals.total} hora(s) acumuladas`
        }
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
          >
            <Plus className="size-4" /> Registrar horas
          </Button>
        }
      />

      <Tabs defaultValue="all">
        <TabsList
          className={cn(
            "grid w-full",
            privileged ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <TabsTrigger value="all" className="gap-1.5">
            <Clock className="size-3.5" />
            Todas las horas
          </TabsTrigger>
          {privileged && (
            <TabsTrigger value="pending" className="gap-1.5">
              <Inbox className="size-3.5" />
              Pendientes de aprobación
              <Badge
                className="ml-1 text-[10px] h-4 px-1.5 tabular-nums bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              >
                {pendingHours.length}
              </Badge>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============ Tab: Todas las horas ============ */}
        <TabsContent value="all" className="mt-4 space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="ring-1 ring-primary/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Briefcase className="size-4" />
                  <p className="text-xs font-medium">Horas administrativas</p>
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {totals.admin}h
                </p>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-sky-500/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
                  <MapPin className="size-4" />
                  <p className="text-xs font-medium">Horas de campo</p>
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {totals.field}h
                </p>
              </CardContent>
            </Card>
            <Card className="ring-1 ring-graphite-500/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-graphite-700 dark:text-graphite-400">
                  <Clock className="size-4" />
                  <p className="text-xs font-medium">Total</p>
                </div>
                <p className="text-2xl font-bold mt-1 tabular-nums">
                  {totals.total}h
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
                  <Filter className="size-4" />
                  <span>Filtrar</span>
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/15 text-primary text-[10px] h-4 px-1.5"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </div>
                <div
                  className={cn(
                    "grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1",
                    privileged ? "lg:grid-cols-5" : "lg:grid-cols-4",
                  )}
                >
                  {privileged && (
                    <div className="space-y-1">
                      <Label htmlFor="h-f-vol" className="text-xs">
                        Voluntario
                      </Label>
                      <Select
                        value={volunteerFilter}
                        onValueChange={setVolunteerFilter}
                      >
                        <SelectTrigger id="h-f-vol" className="h-9 w-full">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            Todos los voluntarios
                          </SelectItem>
                          {volunteers.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} · {v.studentId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="h-f-type" className="text-xs">
                      Tipo
                    </Label>
                    <Select
                      value={typeFilter}
                      onValueChange={setTypeFilter}
                    >
                      <SelectTrigger id="h-f-type" className="h-9 w-full">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los tipos</SelectItem>
                        <SelectItem value="admin">Administrativas</SelectItem>
                        <SelectItem value="field">De campo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="h-f-status" className="text-xs">
                      Estado
                    </Label>
                    <Select
                      value={approvalFilter}
                      onValueChange={(v) =>
                        setApprovalFilter(v as ApprovalFilter)
                      }
                    >
                      <SelectTrigger id="h-f-status" className="h-9 w-full">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="pending">Pendientes</SelectItem>
                        <SelectItem value="approved">Aprobadas</SelectItem>
                        <SelectItem value="rejected">Rechazadas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="h-f-from" className="text-xs">
                      Desde
                    </Label>
                    <Input
                      id="h-f-from"
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="h-f-to" className="text-xs">
                      Hasta
                    </Label>
                    <Input
                      id="h-f-to"
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Label htmlFor="h-f-search" className="text-xs">
                    Buscar
                  </Label>
                  <Search className="absolute left-2.5 top-[26px] size-3.5 text-muted-foreground" />
                  <Input
                    id="h-f-search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Voluntario, actividad, notas…"
                    aria-label="Buscar horas sociales"
                    className="h-9 pl-8"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => applyPreset("month")}
                  >
                    Este mes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => applyPreset("quarter")}
                  >
                    3 meses
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => applyPreset("year")}
                  >
                    Este año
                  </Button>
                  {activeFilterCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-destructive hover:text-destructive"
                      onClick={clearFilters}
                    >
                      <X className="size-3.5" /> Limpiar
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={
                    activeFilterCount > 0
                      ? "Sin resultados"
                      : "Sin registros de horas"
                  }
                  description={
                    activeFilterCount > 0
                      ? "Ningún registro coincide con los filtros aplicados. Prueba ajustar los criterios."
                      : "Registra horas sociales para los voluntarios."
                  }
                  action={
                    activeFilterCount > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        <X className="size-3.5" /> Limpiar filtros
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto scroll-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">
                          Voluntario
                        </TableHead>
                        <TableHead className="min-w-[180px]">
                          Actividad
                        </TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="min-w-[160px]">Notas</TableHead>
                        {privileged && (
                          <TableHead className="text-right">Acciones</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((h) => (
                        <TableRow
                          key={h.id}
                          className="transition-colors hover:bg-accent/40"
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="size-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                                {volName(h.volunteerId)
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  <Highlight
                                    text={volName(h.volunteerId)}
                                    query={searchTerm}
                                  />
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {volCarnet(h.volunteerId)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <Highlight
                              text={actTitle(h.activityId)}
                              query={searchTerm}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn(
                                h.type === "admin"
                                  ? "bg-primary/15 text-primary"
                                  : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
                              )}
                            >
                              {h.type === "admin" ? "Admin" : "Campo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <HourStatusBadge hour={h} />
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {h.hours}h
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(h.date)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                            <Highlight
                              text={h.notes || "—"}
                              query={searchTerm}
                            />
                          </TableCell>
                          {privileged && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  onClick={() => {
                                    setEditing(h);
                                    setFormOpen(true);
                                  }}
                                  aria-label="Editar"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive"
                                  onClick={() => setDeleteTarget(h)}
                                  aria-label="Eliminar"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Tab: Pendientes de aprobación ============ */}
        {privileged && (
          <TabsContent value="pending" className="mt-4 space-y-3">
            {pendingLoading ? (
              <Card>
                <CardContent className="p-4 space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : pendingHours.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={CheckCircle2}
                    title="No hay horas pendientes"
                    description="Todas las horas sociales han sido revisadas. Cuando un voluntario registre horas nuevas, aparecerán aquí para aprobación."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="max-h-[36rem] overflow-y-auto scroll-thin space-y-3 pr-1">
                {pendingHours.map((h, i) => (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                  >
                    <PendingHourCard
                      hour={h}
                      volName={volName(h.volunteerId)}
                      volCarnet={volCarnet(h.volunteerId)}
                      actTitle={actTitle(h.activityId)}
                      reviewing={reviewing}
                      onApprove={() => handleApproveHour(h)}
                      onReject={() => setRejectTarget(h)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <HourFormDialog
        open={formOpen}
        editing={editing}
        volunteers={volunteers}
        activities={activities}
        defaultVolunteerId={
          !privileged && user?.id
            ? user.id
            : volunteerFilter !== "all"
              ? volunteerFilter
              : undefined
        }
        lockVolunteer={!privileged}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await socialHoursApi.update(editing.id, data);
              toast.success("Registro actualizado");
            } else {
              await socialHoursApi.create({
                ...data,
                pendingApproval: !privileged ? true : undefined,
              } as Parameters<typeof socialHoursApi.create>[0]);
              toast.success(
                privileged
                  ? "Horas registradas (aprobadas)"
                  : "Horas enviadas a aprobación",
              );
            }
            setFormOpen(false);
            setEditing(null);
            loadAll();
            loadPending();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Error al guardar");
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro de horas?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro de {deleteTarget?.hours} hora(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RejectHourDialog
        hour={rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        submitting={reviewing}
        onConfirm={(reason) => {
          if (rejectTarget) handleRejectHour(rejectTarget, reason);
        }}
      />
    </motion.div>
  );
}

/* =================================================================== */
/* Status badge for social hours                                        */
/* =================================================================== */

function HourStatusBadge({ hour }: { hour: SocialHour }) {
  const status = hour.approvalStatus ?? "approved";
  if (status === "pending") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 cursor-help">
              <Hourglass className="size-3 mr-1" />
              Pendiente
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <span className="inline-flex items-start gap-1.5">
            <Info className="size-3 mt-0.5 shrink-0" />
            <span>
              Esta hora está pendiente de aprobación por un
              líder/presidente/vice.
            </span>
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }
  if (status === "approved") {
    return (
      <Badge className="bg-primary/15 text-primary border-primary/30">
        <CheckCircle2 className="size-3 mr-1" />
        Aprobada
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          <Badge className="bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 cursor-help">
            <XCircle className="size-3 mr-1" />
            Rechazada
          </Badge>
        </span>
      </TooltipTrigger>
      {hour.rejectionReason && (
        <TooltipContent side="top" className="max-w-[280px]">
          <span className="inline-flex items-start gap-1.5">
            <Info className="size-3 mt-0.5 shrink-0" />
            <span>{hour.rejectionReason}</span>
          </span>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

/* =================================================================== */
/* Pending hour card — for the review tab                               */
/* =================================================================== */

function PendingHourCard({
  hour,
  volName,
  volCarnet,
  actTitle,
  reviewing,
  onApprove,
  onReject,
}: {
  hour: SocialHour;
  volName: string;
  volCarnet: string;
  actTitle: string;
  reviewing: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="ring-1 ring-amber-300/40 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {volName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold truncate">{volName}</p>
              {volCarnet && (
                <span className="text-xs text-muted-foreground font-mono">
                  {volCarnet}
                </span>
              )}
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                <Hourglass className="size-3 mr-1" />
                Pendiente
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {actTitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Horas
            </p>
            <p className="font-semibold tabular-nums text-primary">
              {hour.hours}h
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tipo
            </p>
            <p className="font-medium">{hour.type === "admin" ? "Admin" : "Campo"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Fecha
            </p>
            <p className="font-medium">{formatDate(hour.date)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Notas
            </p>
            <p className="text-xs text-muted-foreground truncate" title={hour.notes || ""}>
              {hour.notes || "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            onClick={onApprove}
            disabled={reviewing}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Check className="size-4" /> Aprobar
          </Button>
          <Button
            onClick={onReject}
            disabled={reviewing}
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
/* Reject hour dialog — asks for rejection reason                       */
/* =================================================================== */

function RejectHourDialog({
  hour,
  onOpenChange,
  submitting,
  onConfirm,
}: {
  hour: SocialHour | null;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (hour) {
      setReason("");
    }
  }, [hour]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = reason.trim();
    if (r.length > 0 && r.length < 3) {
      toast.error("El motivo debe tener al menos 3 caracteres");
      return;
    }
    onConfirm(r);
  }

  return (
    <Dialog open={!!hour} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-rose-600" />
            Rechazar hora social
          </DialogTitle>
          <DialogDescription>
            {hour ? (
              <>
                Vas a rechazar el registro de{" "}
                <strong>{hour.hours}h</strong>. Explica el motivo para que el
                voluntario lo entienda.
              </>
            ) : (
              "Explica el motivo del rechazo."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rh-reason">
              Motivo del rechazo{" "}
              <span className="text-muted-foreground font-normal">
                ({reason.length}/500)
              </span>
            </Label>
            <Textarea
              id="rh-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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

interface HourFormData {
  volunteerId: string;
  activityId?: string | null;
  hours: number;
  type: HourType;
  date?: string;
  notes?: string;
}

function HourFormDialog({
  open,
  editing,
  volunteers,
  activities,
  defaultVolunteerId,
  lockVolunteer,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: SocialHour | null;
  volunteers: Volunteer[];
  activities: Activity[];
  defaultVolunteerId?: string;
  lockVolunteer?: boolean;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: HourFormData) => void | Promise<void>;
}) {
  const [volunteerId, setVolunteerId] = useState("");
  const [activityId, setActivityId] = useState("none");
  const [hours, setHours] = useState("1");
  const [type, setType] = useState<HourType>("field");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setVolunteerId(editing?.volunteerId || defaultVolunteerId || "");
      setActivityId(editing?.activityId || "none");
      setHours(String(editing?.hours ?? 1));
      setType(editing?.type || "field");
      setDate(
        editing?.date
          ? editing.date.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      );
      setNotes(editing?.notes || "");
    }
  }, [open, editing, defaultVolunteerId]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!volunteerId) {
      toast.error("Selecciona un voluntario");
      return;
    }
    const h = Number(hours);
    if (isNaN(h) || h <= 0) {
      toast.error("Las horas deben ser un número positivo");
      return;
    }
    onSubmit({
      volunteerId,
      activityId: activityId === "none" ? null : activityId,
      hours: h,
      type,
      date: date || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar horas" : "Registrar horas"}
          </DialogTitle>
          <DialogDescription>
            Asigna horas sociales a un voluntario.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="h-vol">Voluntario</Label>
            <Select
              value={volunteerId}
              onValueChange={setVolunteerId}
              disabled={lockVolunteer && !!volunteerId}
            >
              <SelectTrigger id="h-vol" className="w-full">
                <SelectValue placeholder="Selecciona un voluntario" />
              </SelectTrigger>
              <SelectContent>
                {volunteers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {v.studentId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lockVolunteer && (
              <p className="text-[11px] text-muted-foreground">
                Como voluntario, solo puedes registrar tus propias horas. Quedarán
                pendientes de aprobación.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-act">Actividad (opcional)</Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger id="h-act" className="w-full">
                <SelectValue placeholder="Sin actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  Registro manual (sin actividad)
                </SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="h-hours">Horas</Label>
              <Input
                id="h-hours"
                type="number"
                min="0"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-type">Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as HourType)}
              >
                <SelectTrigger id="h-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field">Campo</SelectItem>
                  <SelectItem value="admin">Administrativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-date">Fecha</Label>
            <Input
              id="h-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="h-notes">Notas</Label>
            <Textarea
              id="h-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones..."
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
              {editing ? "Guardar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
