"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  GraduationCap,
  CalendarDays,
  Clock,
  School,
  Search,
  Loader2,
  Filter,
  X,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  classesApi,
  volunteersApi,
  committeesApi,
  committeeColorClass,
  formatDate,
  isPrivileged as isPrivilegedRole,
  type ClassItem,
  type Volunteer,
  type Committee,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight } from "../Shared";
import { cn } from "@/lib/utils";

export function ClasesSection() {
  const { user } = useAuthStore();
  const isAdmin = isPrivilegedRole(user?.role);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [committeeFilter, setCommitteeFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);
  const [completeTarget, setCompleteTarget] = useState<ClassItem | null>(null);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cs, vols, coms] = await Promise.all([
        classesApi.list(),
        volunteersApi.list(),
        committeesApi.list(),
      ]);
      setClasses(cs);
      setVolunteers(vols);
      setCommittees(coms);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar clases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Unique schools for filter dropdown
  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => { if (c.school) set.add(c.school); });
    return Array.from(set).sort();
  }, [classes]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    if (instructorFilter !== "all") n++;
    if (committeeFilter !== "all") n++;
    if (schoolFilter !== "all") n++;
    if (fromDate) n++;
    if (toDate) n++;
    return n;
  }, [search, instructorFilter, committeeFilter, schoolFilter, fromDate, toDate]);

  const filtered = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(search.trim());
    return classes.filter((c) => {
      if (q) {
        const matches = norm(c.title).includes(q)
          || norm(c.topic || "").includes(q)
          || norm(c.school || "").includes(q)
          || norm(c.description || "").includes(q);
        if (!matches) return false;
      }
      if (instructorFilter !== "all") {
        const has = (c.instructors || []).some((i) => i.id === instructorFilter);
        if (!has) return false;
      }
      if (committeeFilter !== "all") {
        if (committeeFilter === "none") {
          if (c.committeeId) return false;
        } else if (c.committeeId !== committeeFilter) {
          return false;
        }
      }
      if (schoolFilter !== "all") {
        if ((c.school || "") !== schoolFilter) return false;
      }
      if (fromDate) {
        if (!c.date || c.date < fromDate) return false;
      }
      if (toDate) {
        if (!c.date || c.date > toDate) return false;
      }
      return true;
    });
  }, [classes, search, instructorFilter, committeeFilter, schoolFilter, fromDate, toDate]);

  function clearFilters() {
    setSearch("");
    setInstructorFilter("all");
    setCommitteeFilter("all");
    setSchoolFilter("all");
    setFromDate("");
    setToDate("");
  }

  async function handleDelete(c: ClassItem) {
    try {
      await classesApi.remove(c.id);
      toast.success("Clase eliminada");
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function handleComplete(c: ClassItem) {
    setCompleting(true);
    try {
      const res = await classesApi.complete(c.id);
      if (res.alreadyCompleted) {
        toast.info("Esta clase ya había sido finalizada");
      } else {
        toast.success(
          `${res.message} (${res.assignedCount} instructor(es) · ${res.hoursPerInstructor}h de campo)`,
        );
      }
      setCompleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al finalizar clase");
    } finally {
      setCompleting(false);
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
        title="Clases"
        description={`${filtered.length} de ${classes.length} clase(s) · ${filtered.reduce((s, c) => s + (c.durationHours || 0), 0).toFixed(1)}h totales`}
        action={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Plus className="size-4" /> Nueva clase
            </Button>
          ) : null
        }
      />

      {/* Filters card */}
      <Card className="ring-1 ring-primary/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="size-4" />
              Filtrar
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="bg-primary/15 text-primary">
                  {activeFilterCount} activo(s)
                </Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 text-xs"
              >
                <X className="size-3.5" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Título, tema, escuela..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                  aria-label="Buscar clases"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Instructor</Label>
              <Select value={instructorFilter} onValueChange={setInstructorFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los instructores</SelectItem>
                  {volunteers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} · {v.studentId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Comité</Label>
              <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los comités</SelectItem>
                  <SelectItem value="none">Sin comité</SelectItem>
                  {committees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Escuela</Label>
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las escuelas</SelectItem>
                  {schoolOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={GraduationCap}
              title={activeFilterCount > 0 ? "Sin resultados" : "Sin clases"}
              description={
                activeFilterCount > 0
                  ? "No hay clases que coincidan con los filtros seleccionados."
                  : "Registra la primera clase impartida."
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="size-4" /> Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const cc = committeeColorClass(c.committee?.color);
            const isCompleted = c.status === "completed";
            return (
              <Card
                key={c.id}
                className={cn(
                  "flex flex-col transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                  isCompleted
                    ? "border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/10"
                    : "hover:border-primary/40",
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      <Highlight text={c.title} query={search} />
                    </CardTitle>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        {!isCompleted && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                                onClick={() => setCompleteTarget(c)}
                                aria-label="Finalizar clase"
                              >
                                <CheckCircle2 className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Finalizar y asignar horas a los instructores
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditing(c);
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
                          onClick={() => setDeleteTarget(c)}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isCompleted && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300">
                        <CheckCircle2 className="size-3" />
                        Finalizada
                      </Badge>
                    )}
                    {c.committee && (
                      <Badge
                        variant="secondary"
                        className={cn("w-fit", cc.bg, cc.text)}
                      >
                        <span className={cn("size-1.5 rounded-full", cc.dot)} />
                        {c.committee.name}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {c.topic && (
                    <p className="text-sm font-medium"><Highlight text={c.topic} query={search} /></p>
                  )}
                  {c.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      <Highlight text={c.description} query={search} />
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {formatDate(c.date)}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="size-3.5" />
                      {c.durationHours} hora(s)
                    </div>
                    {c.school && (
                      <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                        <School className="size-3.5" />
                        <span className="truncate"><Highlight text={c.school} query={search} /></span>
                      </div>
                    )}
                  </div>
                  {c.instructors && c.instructors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t">
                      <span className="text-xs text-muted-foreground">
                        Instructores:
                      </span>
                      {c.instructors.map((ins) => (
                        <span
                          key={ins.id}
                          className="inline-flex items-center gap-1 text-xs"
                          title={`${ins.name} · ${ins.studentId}`}
                        >
                          <span className="size-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-semibold">
                            {ins.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="hidden sm:inline">
                            {ins.name.split(" ").slice(0, 2).join(" ")}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ClassFormDialog
        open={formOpen}
        editing={editing}
        volunteers={volunteers}
        committees={committees}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await classesApi.update(editing.id, data);
              toast.success("Clase actualizada");
            } else {
              await classesApi.create(data as Parameters<typeof classesApi.create>[0]);
              toast.success("Clase creada");
            }
            setFormOpen(false);
            setEditing(null);
            load();
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
            <AlertDialogTitle>¿Eliminar clase?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente{" "}
              <span className="font-medium">{deleteTarget?.title}</span>.
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

      <AlertDialog
        open={!!completeTarget}
        onOpenChange={(o) => !o && setCompleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar clase?</AlertDialogTitle>
            <AlertDialogDescription>
              Se marcará como finalizada{" "}
              <span className="font-medium">{completeTarget?.title}</span> y se
              asignarán automáticamente{" "}
              <span className="font-medium">
                {completeTarget?.durationHours ?? 0} hora(s)
              </span>{" "}
              de campo a cada instructor.
              <br />
              <br />
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={completing}
              onClick={() => completeTarget && handleComplete(completeTarget)}
            >
              {completing && <Loader2 className="size-4 animate-spin" />}
              Finalizar y asignar horas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

interface ClassFormData {
  title: string;
  date?: string;
  durationHours: number;
  school?: string;
  topic?: string;
  description?: string;
  committeeId?: string | null;
  instructorIds: string[];
}

function ClassFormDialog({
  open,
  editing,
  volunteers,
  committees,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: ClassItem | null;
  volunteers: Volunteer[];
  committees: Committee[];
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: ClassFormData) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [school, setSchool] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [committeeId, setCommitteeId] = useState("none");
  const [instructorIds, setInstructorIds] = useState<string[]>([]);
  const [insSearch, setInsSearch] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(editing?.title || "");
      setDate(editing?.date ? editing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setDurationHours(String(editing?.durationHours ?? 1));
      setSchool(editing?.school || "");
      setTopic(editing?.topic || "");
      setDescription(editing?.description || "");
      setCommitteeId(editing?.committeeId || "none");
      setInstructorIds(editing?.instructors?.map((i) => i.id) || []);
      setInsSearch("");
    }
  }, [open, editing]);

  function toggleInstructor(id: string) {
    setInstructorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filteredInstructors = useMemo(() => {
    const q = insSearch.trim().toLowerCase();
    if (!q) return volunteers;
    return volunteers.filter(
      (v) =>
        v.name.toLowerCase().includes(q) || v.studentId.includes(q),
    );
  }, [volunteers, insSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) {
      toast.error("El título debe tener al menos 3 caracteres");
      return;
    }
    onSubmit({
      title: title.trim(),
      date: date || undefined,
      durationHours: Number(durationHours) || 1,
      school: school.trim() || undefined,
      topic: topic.trim() || undefined,
      description: description.trim() || undefined,
      committeeId: committeeId === "none" ? null : committeeId,
      instructorIds,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar clase" : "Nueva clase"}
          </DialogTitle>
          <DialogDescription>
            Registra una clase impartida por voluntarios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cl-title">Título</Label>
            <Input
              id="cl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cl-date">Fecha</Label>
              <Input
                id="cl-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-dur">Duración (horas)</Label>
              <Input
                id="cl-dur"
                type="number"
                min="0.5"
                step="0.5"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cl-school">Escuela</Label>
              <Input
                id="cl-school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="Centro Escolar..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cl-topic">Tema</Label>
              <Input
                id="cl-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cl-committee">Comité</Label>
            <Select value={committeeId} onValueChange={setCommitteeId}>
              <SelectTrigger id="cl-committee" className="w-full">
                <SelectValue placeholder="Sin comité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin comité</SelectItem>
                {committees.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cl-desc">Descripción</Label>
            <Textarea
              id="cl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Instructores ({instructorIds.length})</Label>
            <Input
              placeholder="Buscar instructor..."
              value={insSearch}
              onChange={(e) => setInsSearch(e.target.value)}
              className="h-9"
            />
            <div className="max-h-40 overflow-y-auto scroll-thin border rounded-md p-1.5 space-y-0.5">
              {filteredInstructors.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin coincidencias
                </p>
              ) : (
                filteredInstructors.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1.5 py-1.5 min-h-[36px]"
                  >
                    <Checkbox
                      checked={instructorIds.includes(v.id)}
                      onCheckedChange={() => toggleInstructor(v.id)}
                    />
                    <span className="size-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                      {v.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate flex-1">{v.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {v.studentId}
                    </span>
                  </label>
                ))
              )}
            </div>
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
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
