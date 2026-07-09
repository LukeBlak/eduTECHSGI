"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Network,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  CalendarDays,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  committeesApi,
  committeeColorClass,
  isPrivileged,
  type Committee,
  type Volunteer,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState } from "../Shared";
import { CommitteeDetailDialog } from "./CommitteeDetailDialog";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = ["emerald", "graphite", "rose", "sky", "violet"];

export function ComitesSection() {
  const { user } = useAuthStore();
  // Pueden crear/editar/eliminar comités: admin, presidente, vicepresidente
  // y líder de comité (todos los roles privilegiados).
  const isAdmin = isPrivileged(user?.role);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [membersByCommittee, setMembersByCommittee] = useState<
    Record<string, Volunteer[]>
  >({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Committee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Committee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Committee | null>(null);

  async function load() {
    setLoading(true);
    try {
      const list = await committeesApi.list();
      setCommittees(list);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar comités");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleExpand(c: Committee) {
    const next = !expanded[c.id];
    setExpanded((s) => ({ ...s, [c.id]: next }));
    if (next && !membersByCommittee[c.id]) {
      setLoadingMembers((s) => ({ ...s, [c.id]: true }));
      try {
        const members = await committeesApi.members(c.id);
        setMembersByCommittee((s) => ({ ...s, [c.id]: members }));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Error al cargar miembros");
      } finally {
        setLoadingMembers((s) => ({ ...s, [c.id]: false }));
      }
    }
  }

  async function handleDelete(c: Committee) {
    try {
      await committeesApi.remove(c.id);
      toast.success("Comité eliminado");
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
        title="Comités"
        description={`${committees.length} comité(es) registrado(s)`}
        action={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Plus className="size-4" /> Nuevo comité
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : committees.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Network}
              title="Sin comités"
              description="Crea el primer comité de la asociación."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {committees.map((c) => {
            const cc = committeeColorClass(c.color);
            const memberCount = c._count?.members ?? 0;
            const activityCount = c._count?.activities ?? 0;
            const classCount = c._count?.classes ?? 0;
            return (
              <Card
                key={c.id}
                className={cn(
                  "overflow-hidden ring-1 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40",
                  cc.ring,
                )}
              >
                <div className={cn("h-1.5 bg-gradient-to-r", cc.gradient)} />
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className={cn("size-3 rounded-full", cc.dot)} />
                        {c.name}
                      </CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {c.description || "Sin descripción"}
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                          aria-label="Editar comité"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => setDeleteTarget(c)}
                          aria-label="Eliminar comité"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div
                      className="rounded-lg border p-2 hover:bg-muted/40 transition-colors"
                      title="Miembros"
                    >
                      <Users className="size-3.5 mx-auto text-sky-600 dark:text-sky-400 mb-0.5" />
                      <p className="text-[10px] text-muted-foreground">Miembros</p>
                      <p className="text-lg font-bold tabular-nums">{memberCount}</p>
                    </div>
                    <div
                      className="rounded-lg border p-2 hover:bg-muted/40 transition-colors"
                      title="Actividades"
                    >
                      <CalendarDays className="size-3.5 mx-auto text-graphite-600 dark:text-graphite-400 mb-0.5" />
                      <p className="text-[10px] text-muted-foreground">Actividades</p>
                      <p className="text-lg font-bold tabular-nums">{activityCount}</p>
                    </div>
                    <div
                      className="rounded-lg border p-2 hover:bg-muted/40 transition-colors"
                      title="Clases"
                    >
                      <GraduationCap className="size-3.5 mx-auto text-violet-600 dark:text-violet-400 mb-0.5" />
                      <p className="text-[10px] text-muted-foreground">Clases</p>
                      <p className="text-lg font-bold tabular-nums">{classCount}</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex-col items-stretch gap-2">
                  <Button
                    variant="default"
                    className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => setDetailTarget(c)}
                  >
                    <Eye className="size-4" />
                    Ver detalle
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-8 text-xs"
                    onClick={() => toggleExpand(c)}
                  >
                    {expanded[c.id] ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    {expanded[c.id] ? "Ocultar miembros" : "Ver miembros"}
                  </Button>
                  {expanded[c.id] && (
                    <div className="mt-2 max-h-64 overflow-y-auto scroll-thin border-t pt-3">
                      {loadingMembers[c.id] ? (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full" />
                          ))}
                        </div>
                      ) : membersByCommittee[c.id]?.length ? (
                        <ul className="space-y-1.5">
                          {membersByCommittee[c.id].map((m) => (
                            <li
                              key={m.id}
                              className="flex items-center gap-2 text-sm rounded-md border px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
                            >
                              <span className="size-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                                {m.name.charAt(0).toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{m.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {m.studentId} · {m.career}
                                </p>
                              </div>
                              {m.role === "admin" && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Admin
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-3">
                          Sin miembros
                        </p>
                      )}
                    </div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <CommitteeFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await committeesApi.update(editing.id, data);
              toast.success("Comité actualizado");
            } else {
              await committeesApi.create(data);
              toast.success("Comité creado");
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

      <CommitteeDetailDialog
        committee={detailTarget}
        open={!!detailTarget}
        onOpenChange={(o) => !o && setDetailTarget(null)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar comité?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el comité{" "}
              <span className="font-medium">{deleteTarget?.name}</span>. Los
              voluntarios asignados quedarán sin comité.
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

function CommitteeFormDialog({
  open,
  editing,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: Committee | null;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: {
    name: string;
    description?: string;
    color?: string;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("emerald");

  useEffect(() => {
    if (open) {
      setName(editing?.name || "");
      setDescription(editing?.description || "");
      setColor(editing?.color || "emerald");
    }
  }, [open, editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 caracteres");
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar comité" : "Nuevo comité"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Actualiza los datos del comité"
              : "Crea un nuevo comité para la asociación"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Nombre</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Logística"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-desc">Descripción</Label>
            <Textarea
              id="c-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción del comité..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-color">Color</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger id="c-color" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="flex items-center gap-2 capitalize">
                      <span
                        className={cn(
                          "size-3 rounded-full",
                          committeeColorClass(c).dot,
                        )}
                      />
                      {c}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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


