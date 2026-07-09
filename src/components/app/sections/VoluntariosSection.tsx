"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Users,
  Loader2,
  Mail,
  Phone,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  volunteersApi,
  committeesApi,
  committeeColorClass,
  CAREERS,
  careerShort,
  careerFull,
  ROLE_LABELS,
  ROLE_BADGE_COLORS,
  isPrivileged,
  type Volunteer,
  type Committee,
  type VolunteerHours,
  type Role,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight, FilterBadge } from "../Shared";

/**
 * Opciones de carrera disponibles en el formulario.
 * Si un voluntario ya existe con una carrera que no está en la lista
 * oficial (datos heredados de versiones anteriores), se incluye
 * dinámicamente para no perder su valor al editar.
 */
function careerOptions(existing?: string): readonly string[] {
  if (existing && !CAREERS.includes(existing as never)) {
    return [...CAREERS, existing];
  }
  return CAREERS;
}

/**
 * Orden jerárquico de roles para mostrar en el selector del formulario
 * (de menor a mayor privilegio). Las etiquetas se toman de ROLE_LABELS.
 */
const ROLE_OPTIONS: Role[] = [
  "volunteer",
  "committee_leader",
  "vice_president",
  "president",
  "admin",
];

/**
 * Orden para mostrar el conteo de roles en la tarjeta de estadísticas
 * (presidente primero, luego vice, líder, voluntario, admin).
 */
const ROLE_STATS_ORDER: Role[] = [
  "president",
  "vice_president",
  "committee_leader",
  "volunteer",
  "admin",
];

export function VoluntariosSection() {
  const { user } = useAuthStore();
  // La sección es privilegedOnly (nav.ts): cualquier usuario que la vea
  // (admin, committee_leader, president, vice_president) puede gestionar
  // voluntarios y asignar roles.
  const privileged = isPrivileged(user?.role);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [committeeFilter, setCommitteeFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Volunteer | null>(null);
  const [detail, setDetail] = useState<Volunteer | null>(null);
  const [detailHours, setDetailHours] = useState<VolunteerHours | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Volunteer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [vols, coms] = await Promise.all([
        volunteersApi.list(),
        committeesApi.list(),
      ]);
      setVolunteers(vols);
      setCommittees(coms);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar voluntarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /**
   * Conteo de voluntarios por rol para la tarjeta de estadísticas.
   * Se calcula sobre la lista completa (no filtrada) para reflejar el
   * estado real de la asociación.
   */
  const roleCounts = useMemo(() => {
    const counts: Record<Role, number> = {
      admin: 0,
      volunteer: 0,
      committee_leader: 0,
      president: 0,
      vice_president: 0,
    };
    for (const v of volunteers) {
      counts[v.role] += 1;
    }
    return counts;
  }, [volunteers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Normalize: strip diacritics so "maria" matches "María", "jose" matches "José"
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const qn = q ? norm(q) : "";
    return volunteers.filter((v) => {
      const matchesSearch =
        !qn ||
        norm(v.name).includes(qn) ||
        norm(v.studentId).includes(qn) ||
        norm(v.email || "").includes(qn) ||
        norm(v.career).includes(qn);
      const matchesCommittee =
        committeeFilter === "all" ||
        (committeeFilter === "none" && !v.committeeId) ||
        v.committeeId === committeeFilter;
      return matchesSearch && matchesCommittee;
    });
  }, [volunteers, search, committeeFilter]);

  const activeFilterCount =
    (search.trim() ? 1 : 0) + (committeeFilter !== "all" ? 1 : 0);
  const hasFilters = activeFilterCount > 0;

  function clearFilters() {
    setSearch("");
    setCommitteeFilter("all");
  }

  async function openDetail(v: Volunteer) {
    setDetail(v);
    setDetailHours(null);
    setDetailLoading(true);
    try {
      const hours = await volunteersApi.hours(v.id);
      setDetailHours(hours);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar horas");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDelete(v: Volunteer) {
    try {
      await volunteersApi.remove(v.id);
      toast.success("Voluntario eliminado");
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
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
        title="Voluntarios"
        description={
          hasFilters
            ? `${filtered.length} de ${volunteers.length} voluntario(s) · ${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"} activo${activeFilterCount === 1 ? "" : "s"}`
            : `${volunteers.length} voluntario(s) registrado(s)`
        }
        action={
          privileged ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Plus className="size-4" /> Nuevo voluntario
            </Button>
          ) : null
        }
      />

      {/* Role distribution stats */}
      {!loading && volunteers.length > 0 && (
        <Card className="bg-accent/30 border-border/60">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1">
                <Users className="size-4" />
                <span className="hidden sm:inline">Distribución de roles</span>
                <span className="sm:hidden">Roles</span>
              </span>
              {ROLE_STATS_ORDER.map((r) => {
                const count = roleCounts[r];
                if (!count) return null;
                return (
                  <Badge
                    key={r}
                    variant="outline"
                    className={`${ROLE_BADGE_COLORS[r]} gap-1.5 font-medium`}
                    title={`${count} ${ROLE_LABELS[r].toLowerCase()}${count === 1 ? "" : "s"}`}
                  >
                    {ROLE_LABELS[r]}
                    <span className="tabular-nums opacity-80">×{count}</span>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, carnet, email o carrera..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 pr-9"
            aria-label="Buscar voluntarios"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 size-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={committeeFilter} onValueChange={setCommitteeFilter}>
          <SelectTrigger className="w-full sm:w-56 h-10">
            <SelectValue placeholder="Todos los comités" />
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
        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="h-10 shrink-0 gap-1.5"
          >
            <X className="size-3.5" /> Limpiar
            <FilterBadge count={activeFilterCount} />
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={hasFilters ? "Sin resultados" : "Sin voluntarios"}
              description={
                hasFilters
                  ? "No se encontraron voluntarios con los filtros actuales. Prueba ajustar la búsqueda o limpiar los filtros."
                  : "No se encontraron voluntarios con los filtros actuales."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters} className="gap-1.5">
                    <X className="size-4" /> Limpiar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Nombre</TableHead>
                    <TableHead className="min-w-[90px]">Carnet</TableHead>
                    <TableHead className="min-w-[72px]">Carrera</TableHead>
                    <TableHead className="min-w-[110px]">Comité</TableHead>
                    <TableHead className="min-w-[100px]">Rol</TableHead>
                    <TableHead className="text-right min-w-[110px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => {
                    const cc = committeeColorClass(v.committee?.color);
                    return (
                      <TableRow key={v.id} className="transition-colors hover:bg-accent/40">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                              {v.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                <Highlight text={v.name} query={search} />
                              </p>
                              {(v.email || v.phone) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  <Highlight text={v.email || v.phone || ""} query={search} />
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <Highlight text={v.studentId} query={search} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary cursor-help"
                                  title={careerFull(v.career)}
                                >
                                  {careerShort(v.career)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px]">
                                <span className="text-xs">{careerFull(v.career)}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          {v.committee ? (
                            <Badge
                              variant="secondary"
                              className={`${cc.bg} ${cc.text} border-0`}
                            >
                              <span className={`size-1.5 rounded-full ${cc.dot}`} />
                              {v.committee.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sin comité
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${ROLE_BADGE_COLORS[v.role]} font-medium`}
                          >
                            {ROLE_LABELS[v.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => openDetail(v)}
                              aria-label={`Ver detalle de ${v.name}`}
                            >
                              <Eye className="size-4" />
                            </Button>
                            {privileged && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  onClick={() => {
                                    setEditing(v);
                                    setFormOpen(true);
                                  }}
                                  aria-label={`Editar ${v.name}`}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTarget(v)}
                                  aria-label={`Eliminar ${v.name}`}
                                  disabled={v.id === user?.id}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit form */}
      <VolunteerFormDialog
        open={formOpen}
        editing={editing}
        committees={committees}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await volunteersApi.update(editing.id, data);
              toast.success("Voluntario actualizado");
            } else {
              await volunteersApi.create(data as Parameters<typeof volunteersApi.create>[0]);
              toast.success("Voluntario creado");
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

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold">
                {detail?.name?.charAt(0).toUpperCase() || "?"}
              </span>
              <div>
                <p className="text-lg">{detail?.name}</p>
                <p className="text-sm text-muted-foreground font-normal">
                  {detail?.studentId} · {detail?.career}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Detalle del voluntario
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="truncate">{detail.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" />
                  <span className="truncate">{detail.phone || "—"}</span>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  {detail.committee ? (
                    <Badge variant="secondary" className={committeeColorClass(detail.committee.color).bg + " " + committeeColorClass(detail.committee.color).text}>
                      {detail.committee.name}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Sin comité</span>
                  )}
                  <Badge
                    variant="outline"
                    className={`ml-2 ${ROLE_BADGE_COLORS[detail.role]} font-medium`}
                  >
                    {ROLE_LABELS[detail.role]}
                  </Badge>
                </div>
              </div>

              {/* Hours summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-accent/60 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Horas totales</p>
                  <p className="text-2xl font-bold text-primary">
                    {detailLoading ? "—" : detailHours?.totalHours ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Admin</p>
                  <p className="text-2xl font-bold">
                    {detailLoading ? "—" : detailHours?.adminHours ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Campo</p>
                  <p className="text-2xl font-bold">
                    {detailLoading ? "—" : detailHours?.fieldHours ?? 0}
                  </p>
                </div>
              </div>

              {/* By activity */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="size-4" /> Horas por actividad
                </p>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : detailHours && detailHours.byActivity.length > 0 ? (
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto scroll-thin">
                    {detailHours.byActivity.map((b) => (
                      <li
                        key={b.activityId}
                        className="flex items-center justify-between text-sm rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{b.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {b.type === "admin" ? "Administrativa" : "Campo"}
                          </p>
                        </div>
                        <Badge variant="secondary">{b.hours}h</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground py-3 text-center">
                    Sin horas registradas
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar voluntario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente a{" "}
              <span className="font-medium">{deleteTarget?.name}</span> y sus
              registros asociados.
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
    </motion.div>
  );
}

interface VolunteerFormData {
  name: string;
  studentId: string;
  career: string;
  committeeId?: string | null;
  role?: Role;
  email?: string;
  phone?: string;
  password?: string;
}

function VolunteerFormDialog({
  open,
  editing,
  committees,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: Volunteer | null;
  committees: Committee[];
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: VolunteerFormData) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [career, setCareer] = useState<string>(CAREERS[0]);
  const [committeeId, setCommitteeId] = useState("none");
  const [role, setRole] = useState<Role>("volunteer");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name || "");
      setStudentId(editing?.studentId || "");
      // Si el voluntario tiene una carrera heredada (no en la lista oficial),
      // la conservamos como valor inicial para no perderla accidentalmente.
      setCareer(editing?.career || CAREERS[0]);
      setCommitteeId(editing?.committeeId || "none");
      setRole(editing?.role || "volunteer");
      setEmail(editing?.email || "");
      setPhone(editing?.phone || "");
      setPassword("");
    }
  }, [open, editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error("El nombre debe tener al menos 3 caracteres");
      return;
    }
    if (!editing && !/^\d{8}$/.test(studentId)) {
      toast.error("El carnet debe tener 8 dígitos");
      return;
    }
    if (!editing && password.length > 0 && password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    onSubmit({
      name: name.trim(),
      studentId: studentId.trim(),
      career,
      committeeId: committeeId === "none" ? null : committeeId,
      role,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      password: password || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scroll-thin">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar voluntario" : "Nuevo voluntario"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Actualiza los datos del voluntario"
              : "Completa los datos del nuevo voluntario"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="v-name">Nombre completo</Label>
            <Input
              id="v-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-sid">Carnet (8 dígitos)</Label>
              <Input
                id="v-sid"
                value={studentId}
                onChange={(e) =>
                  setStudentId(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                disabled={!!editing}
                placeholder="20241234"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-career">Carrera</Label>
              <Select value={career} onValueChange={setCareer}>
                <SelectTrigger id="v-career" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {careerOptions(editing?.career).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-committee">Comité</Label>
              <Select value={committeeId} onValueChange={setCommitteeId}>
                <SelectTrigger id="v-committee" className="w-full">
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
              <Label htmlFor="v-role">Rol</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="v-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-email">Email</Label>
              <Input
                id="v-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ana@esen.edu.sv"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-phone">Teléfono</Label>
              <Input
                id="v-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="7000-0000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-password">
              Contraseña{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ({editing ? "dejar vacío para no cambiar" : "vacío = 'voluntario123'"})
              </span>
            </Label>
            <Input
              id="v-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
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
              {editing ? "Guardar cambios" : "Crear voluntario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
