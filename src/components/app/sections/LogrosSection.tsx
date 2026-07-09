"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Trophy,
  Medal,
  Award,
  Plus,
  Pencil,
  Trash2,
  Search,
  Sparkles,
  Gift,
  Crown,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Users,
  Star,
  Zap,
  Target,
  Calendar,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuthStore } from "@/lib/auth-store";
import {
  achievementsApi,
  volunteersApi,
  tierConfig,
  ACHIEVEMENT_TIERS,
  AUTO_CRITERIA,
  autoCriteriaLabel,
  isPrivileged,
  formatDate,
  careerShort,
  type Achievement,
  type VolunteerAchievement,
  type Volunteer,
  type AchievementTier,
  type AutoCriteriaType,
} from "@/lib/api";
import { SectionHeader, EmptyState, StatCard } from "../Shared";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "../realtime/RealtimeProvider";

type AdminTab = "catalog" | "grants" | "ranking";

export function LogrosSection() {
  const { user } = useAuthStore();
  const privileged = isPrivileged(user?.role);

  if (privileged) {
    return <AdminView />;
  }
  return <VolunteerView />;
}

/* ============================================================
   ADMIN VIEW — Presidente / Vice / Líder / Admin
   ============================================================ */

function AdminView() {
  const [tab, setTab] = useState<AdminTab>("catalog");

  const reloadKey = useState(0);
  const [, setBump] = reloadKey;

  // Realtime: cuando cambian logros o concesiones, refrescar.
  useRealtimeRefresh(
    [
      "achievement:created",
      "achievement:updated",
      "achievement:deleted",
      "achievement:granted",
      "achievement:revoked",
    ],
    useCallback(() => setBump((n) => n + 1), [setBump]),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Logros y Reconocimientos"
        description="Gestiona los logros que los voluntarios pueden ganar. Crea logros automáticos (que el sistema otorga solo) o manuales (que tú otorgas)."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="catalog" className="gap-1.5">
            <Trophy className="size-3.5" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="grants" className="gap-1.5">
            <Gift className="size-3.5" /> Otorgar
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1.5">
            <Crown className="size-3.5" /> Ranking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-5">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="grants" className="mt-5">
          <GrantsTab />
        </TabsContent>
        <TabsContent value="ranking" className="mt-5">
          <RankingTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

/* ---------- Tab 1: Catálogo ---------- */

function CatalogTab() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Achievement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState<Achievement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await achievementsApi.list(true);
      setAchievements(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar logros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh(
    ["achievement:created", "achievement:updated", "achievement:deleted", "achievement:granted", "achievement:revoked"],
    load,
  );

  const filtered = useMemo(() => {
    return achievements.filter((a) => {
      if (tierFilter !== "all" && a.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [achievements, search, tierFilter]);

  const stats = useMemo(() => {
    const total = achievements.length;
    const active = achievements.filter((a) => a.active).length;
    const auto = achievements.filter((a) => a.auto && a.autoType !== "none").length;
    const granted = achievements.reduce((sum, a) => sum + (a._count?.volunteers ?? 0), 0);
    return { total, active, auto, granted };
  }, [achievements]);

  async function handleDelete() {
    if (!toDelete) return;
    try {
      await achievementsApi.remove(toDelete.id);
      toast.success(`Logro "${toDelete.name}" eliminado`);
      setToDelete(null);
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar logro");
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Logros totales" value={stats.total} icon={Trophy} accent="emerald" />
        <StatCard title="Logros activos" value={stats.active} icon={CheckCircle2} accent="sky" />
        <StatCard title="Logros automáticos" value={stats.auto} icon={Zap} accent="violet" />
        <StatCard title="Veces otorgados" value={stats.granted} icon={Award} accent="rose" />
      </div>

      {/* Toolbar */}
      <Card className="ring-1 ring-border/60">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar logros por nombre o descripción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="h-11 w-full md:w-44">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los niveles</SelectItem>
              {ACHIEVEMENT_TIERS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.emoji} {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" /> Nuevo logro
          </Button>
        </CardContent>
      </Card>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={search || tierFilter !== "all" ? "Sin resultados" : "No hay logros aún"}
          description={
            search || tierFilter !== "all"
              ? "Prueba con otros filtros de búsqueda."
              : "Crea el primer logro para que tus voluntarios puedan ganarlo."
          }
          action={
            !search && tierFilter === "all" ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="size-4" /> Crear primer logro
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ach) => (
            <AchievementCard
              key={ach.id}
              achievement={ach}
              onEdit={() => {
                setEditing(ach);
                setShowForm(true);
              }}
              onDelete={() => setToDelete(ach)}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      <AchievementFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        achievement={editing}
        onSaved={() => {
          setShowForm(false);
          void load();
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar logro?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el logro <strong>{toDelete?.name}</strong>. Esto también
              quitará el logro de todos los voluntarios que lo tengan. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AchievementCard({
  achievement,
  onEdit,
  onDelete,
}: {
  achievement: Achievement;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tier = tierConfig(achievement.tier);
  const grantedCount = achievement._count?.volunteers ?? 0;

  return (
    <Card
      className={cn(
        "relative overflow-hidden ring-1 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 group",
        tier.ring,
        !achievement.active && "opacity-60",
      )}
    >
      {/* Tier gradient header */}
      <div className={cn("h-1.5 bg-gradient-to-r", tier.gradient)} />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "size-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ring-1",
              tier.bg,
              tier.text,
              tier.ring,
            )}
          >
            <span aria-hidden>{tier.emoji}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-base leading-tight truncate">
                {achievement.name}
              </h3>
              {achievement.auto && achievement.autoType !== "none" && (
                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 shrink-0">
                  <Zap className="size-3 mr-1" /> Auto
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tier.label} · {achievement.points} pts
            </p>
          </div>
        </div>

        {achievement.description && (
          <p className="text-sm text-muted-foreground line-clamp-3 min-h-[2.5rem]">
            {achievement.description}
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Target className="size-3" />
              {achievement.auto && achievement.autoType !== "none"
                ? autoCriteriaLabel(achievement.autoType)
                : "Manual"}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="size-3" />
              {grantedCount} {grantedCount === 1 ? "voluntario" : "voluntarios"}
            </span>
          </div>
          {!achievement.active && (
            <Badge variant="outline" className="text-muted-foreground">
              Inactivo
            </Badge>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button
            onClick={onEdit}
            variant="outline"
            size="sm"
            className="flex-1 h-9"
          >
            <Pencil className="size-3.5" /> Editar
          </Button>
          <Button
            onClick={onDelete}
            variant="outline"
            size="sm"
            className="h-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AchievementFormDialog({
  open,
  onOpenChange,
  achievement,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  achievement: Achievement | null;
  onSaved: () => void;
}) {
  const isEdit = !!achievement;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    tier: "bronze" as AchievementTier,
    points: 10,
    auto: false,
    autoType: "none" as AutoCriteriaType,
    autoThreshold: 0,
    active: true,
    icon: "Trophy",
    color: "emerald",
  });

  useEffect(() => {
    if (achievement) {
      setForm({
        name: achievement.name,
        description: achievement.description,
        tier: achievement.tier,
        points: achievement.points,
        auto: achievement.auto,
        autoType: achievement.autoType,
        autoThreshold: achievement.autoThreshold,
        active: achievement.active,
        icon: achievement.icon,
        color: achievement.color,
      });
    } else {
      setForm({
        name: "",
        description: "",
        tier: "bronze",
        points: 10,
        auto: false,
        autoType: "none",
        autoThreshold: 0,
        active: true,
        icon: "Trophy",
        color: "emerald",
      });
    }
  }, [achievement, open]);

  const currentAuto = AUTO_CRITERIA.find((c) => c.id === form.autoType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (form.auto && form.autoType === "none") {
      toast.error("Si el logro es automático, selecciona un criterio");
      return;
    }
    if (currentAuto?.needsThreshold && form.autoThreshold <= 0) {
      toast.error("El umbral del criterio automático debe ser mayor que 0");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && achievement) {
        await achievementsApi.update(achievement.id, form);
        toast.success("Logro actualizado");
      } else {
        await achievementsApi.create(form);
        toast.success("Logro creado");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar logro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar logro" : "Nuevo logro"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del logro. Si lo cambias a automático, se evaluará para todos los voluntarios."
              : "Crea un logro que los voluntarios podrán ganar. Puedes hacerlo automático o manual."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ach-name">Nombre *</Label>
              <Input
                id="ach-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Voluntario Destacado"
                className="h-11"
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ach-desc">Descripción</Label>
              <Textarea
                id="ach-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe qué debe hacer el voluntario para ganar este logro..."
                rows={3}
                maxLength={800}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ach-tier">Nivel / Tier</Label>
              <Select
                value={form.tier}
                onValueChange={(v) => setForm({ ...form, tier: v as AchievementTier })}
              >
                <SelectTrigger id="ach-tier" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACHIEVEMENT_TIERS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.emoji} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ach-points">Puntos</Label>
              <Input
                id="ach-points"
                type="number"
                min={0}
                max={100000}
                value={form.points}
                onChange={(e) =>
                  setForm({ ...form, points: parseInt(e.target.value, 10) || 0 })
                }
                className="h-11"
              />
            </div>
          </div>

          {/* Auto / Manual switch */}
          <Card className="ring-1 ring-border/60">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-violet-500" />
                    <Label className="text-sm font-semibold cursor-pointer">
                      Logro automático
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Si activas esto, el sistema evaluará el criterio y otorgará el
                    logro automáticamente a los voluntarios que lo cumplan.
                  </p>
                </div>
                <Switch
                  checked={form.auto}
                  onCheckedChange={(v) =>
                    setForm({ ...form, auto: v, autoType: v ? form.autoType : "none" })
                  }
                />
              </div>

              <AnimatePresence>
                {form.auto && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 pt-2 border-t border-border/60"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="ach-auto">Criterio automático</Label>
                      <Select
                        value={form.autoType}
                        onValueChange={(v) =>
                          setForm({ ...form, autoType: v as AutoCriteriaType })
                        }
                      >
                        <SelectTrigger id="ach-auto" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUTO_CRITERIA.filter((c) => c.id !== "none").map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentAuto && (
                        <p className="text-xs text-muted-foreground">
                          {currentAuto.description}
                        </p>
                      )}
                    </div>

                    {currentAuto?.needsThreshold && (
                      <div className="space-y-2">
                        <Label htmlFor="ach-threshold">
                          Umbral (cantidad mínima)
                        </Label>
                        <Input
                          id="ach-threshold"
                          type="number"
                          min={0}
                          step={0.5}
                          value={form.autoThreshold}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              autoThreshold: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-11"
                        />
                        <p className="text-xs text-muted-foreground">
                          El logro se otorgará cuando el voluntario alcance o supere este valor.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-start justify-between gap-3 pt-2 border-t border-border/60">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Logro activo</Label>
                  <p className="text-xs text-muted-foreground">
                    Los logros inactivos no se muestran ni se evalúan.
                  </p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear logro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Tab 2: Otorgar manualmente ---------- */

function GrantsTab() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [grants, setGrants] = useState<VolunteerAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAchievement, setSelectedAchievement] = useState<string>("");
  const [granting, setGranting] = useState(false);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [achs, vols, grs] = await Promise.all([
        achievementsApi.list(false),
        volunteersApi.list(),
        achievementsApi.allGrants(),
      ]);
      setAchievements(achs);
      setVolunteers(vols);
      setGrants(grs);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh(
    ["achievement:granted", "achievement:revoked", "achievement:created", "achievement:updated", "achievement:deleted"],
    load,
  );

  // Mapa: volunteerId -> Set de achievementIds que ya tiene
  const grantsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const g of grants) {
      const set = m.get(g.volunteerId) ?? new Set<string>();
      set.add(g.achievementId);
      m.set(g.volunteerId, set);
    }
    return m;
  }, [grants]);

  const filteredVolunteers = useMemo(() => {
    if (!search) return volunteers;
    const q = search.toLowerCase();
    return volunteers.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.studentId.toLowerCase().includes(q),
    );
  }, [volunteers, search]);

  const selectedAch = achievements.find((a) => a.id === selectedAchievement);

  async function handleGrant(volunteerId: string) {
    if (!selectedAch) {
      toast.error("Selecciona un logro primero");
      return;
    }
    setGranting(true);
    try {
      await achievementsApi.grant(selectedAch.id, { volunteerId, notes: notes.trim() });
      toast.success(`Logro "${selectedAch.name}" otorgado`);
      setNotes("");
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error al otorgar logro");
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(achievementId: string, volunteerId: string, name: string) {
    try {
      await achievementsApi.revoke(achievementId, { volunteerId });
      toast.success(`Logro "${name}" revocado`);
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error al revocar logro");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="ring-1 ring-border/60">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Gift className="size-4 text-primary" />
              Selecciona el logro que vas a otorgar
            </Label>
            <Select value={selectedAchievement} onValueChange={setSelectedAchievement}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Elige un logro del catálogo..." />
              </SelectTrigger>
              <SelectContent>
                {achievements.map((a) => {
                  const tier = tierConfig(a.tier);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {tier.emoji} {a.name} · {a.points} pts
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedAch && (
              <p className="text-xs text-muted-foreground">
                {selectedAch.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-notes">Nota (opcional)</Label>
            <Input
              id="grant-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mensaje que verá el voluntario en su notificación..."
              className="h-11"
              maxLength={500}
            />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar voluntario por nombre o carnet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : filteredVolunteers.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description="No se encontraron voluntarios con ese criterio."
        />
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto scroll-thin pr-1">
          {filteredVolunteers.map((v) => {
            const hasIt = grantsMap.get(v.id)?.has(selectedAchievement);
            const volsGrants = grants.filter((g) => g.volunteerId === v.id);
            return (
              <div
                key={v.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  hasIt
                    ? "border-primary/30 bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/40",
                )}
              >
                <Avatar className="size-10 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                    {v.name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{v.name}</p>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {careerShort(v.career)}
                    </Badge>
                    {v.role !== "volunteer" && (
                      <Badge className="text-[10px] py-0 bg-primary/15 text-primary">
                        {v.role === "president"
                          ? "Presidente"
                          : v.role === "vice_president"
                            ? "Vice"
                            : v.role === "committee_leader"
                              ? "Líder"
                              : "Admin"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.studentId}
                    {volsGrants.length > 0 && (
                      <span className="ml-2">
                        · {volsGrants.length} logro{volsGrants.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </p>
                </div>
                {hasIt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(selectedAchievement!, v.id, selectedAch?.name || "")}
                    className="h-9 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <XCircle className="size-3.5 mr-1" /> Quitar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => handleGrant(v.id)}
                    disabled={!selectedAchievement || granting}
                    className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Gift className="size-3.5 mr-1" /> Otorgar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Tab 3: Ranking de logros ---------- */

function RankingTab() {
  const [top, setTop] = useState<{
    volunteerId: string;
    points: number;
    count: number;
    volunteer: Volunteer;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await achievementsApi.leaderboard(20);
      setTop(res.top);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar ranking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh(
    ["achievement:granted", "achievement:revoked"],
    load,
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (top.length === 0) {
    return (
      <EmptyState
        icon={Crown}
        title="Aún no hay ranking"
        description="Cuando los voluntarios empiecen a ganar logros, aparecerán aquí ordenados por puntos."
      />
    );
  }

  const maxPoints = top[0]?.points || 1;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
        <Info className="size-4" />
        Ranking basado en la suma de puntos de los logros ganados por cada voluntario.
      </div>
      {top.map((entry, i) => {
        const tier =
          i === 0
            ? { emoji: "🥇", label: "Oro", gradient: "from-yellow-500 to-amber-600" }
            : i === 1
              ? { emoji: "🥈", label: "Plata", gradient: "from-slate-400 to-slate-600" }
              : i === 2
                ? { emoji: "🥉", label: "Bronce", gradient: "from-amber-600 to-amber-800" }
                : { emoji: `${i + 1}`, label: "Top", gradient: "from-primary to-secondary" };
        const pct = (entry.points / maxPoints) * 100;
        return (
          <Card
            key={entry.volunteerId}
            className={cn(
              "ring-1 ring-border/60 overflow-hidden",
              i < 3 && "ring-2",
            )}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div
                  className={cn(
                    "size-12 rounded-2xl flex items-center justify-center text-xl font-bold bg-gradient-to-br text-white shrink-0",
                    tier.gradient,
                  )}
                >
                  {tier.emoji}
                </div>
                <Avatar className="size-10 hidden sm:flex shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                    {entry.volunteer?.name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">
                      {entry.volunteer?.name || "—"}
                    </p>
                    <span className="text-sm font-bold tabular-nums text-primary shrink-0">
                      {entry.points} pts
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={pct} className="h-1.5" />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {entry.count} logro{entry.count === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ============================================================
   VOLUNTEER VIEW — Galería de logros ganados / por ganar
   ============================================================ */

function VolunteerView() {
  const { user } = useAuthStore();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [mine, setMine] = useState<VolunteerAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [achs, mineRes] = await Promise.all([
        achievementsApi.list(false),
        achievementsApi.mine(),
      ]);
      setAchievements(achs);
      setMine(mineRes);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar logros");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh(
    ["achievement:created", "achievement:updated", "achievement:granted", "achievement:revoked", "achievement:deleted"],
    load,
  );

  const mineMap = useMemo(() => {
    const m = new Map<string, VolunteerAchievement>();
    for (const g of mine) m.set(g.achievementId, g);
    return m;
  }, [mine]);

  const totalPoints = useMemo(
    () => mine.reduce((sum, g) => sum + (g.achievement?.points || 0), 0),
    [mine],
  );

  const earnedCount = mine.length;
  const totalCount = achievements.length;
  const pct = totalCount > 0 ? (earnedCount / totalCount) * 100 : 0;

  // Agrupar por tier para mostrar en secciones
  const byTier = useMemo(() => {
    const groups: Record<string, Achievement[]> = {};
    for (const a of achievements) {
      if (!groups[a.tier]) groups[a.tier] = [];
      groups[a.tier].push(a);
    }
    return groups;
  }, [achievements]);

  async function handleEvaluate() {
    setEvaluating(true);
    try {
      const res = await achievementsApi.evaluateMine();
      if (res.granted > 0) {
        toast.success(`¡Felicidades! Has ganado ${res.granted} logro(s) nuevo(s)`);
      } else {
        toast.info("No tienes nuevos logros por ahora. ¡Sigue participando!");
      }
      void load();
    } catch (err: any) {
      toast.error(err.message || "Error al evaluar logros");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <SectionHeader
        title="Mis Logros"
        description="Gana logros participando en actividades, clases y acumulando horas sociales. ¡Algunos se desbloquean automáticamente!"
        action={
          <Button
            onClick={handleEvaluate}
            disabled={evaluating || loading}
            variant="outline"
            className="h-11"
          >
            {evaluating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Re-evaluar
          </Button>
        }
      />

      {/* Progress summary */}
      <Card className="ring-1 ring-primary/20 overflow-hidden">
        <div className="h-1 bg-brand-gradient" />
        <CardContent className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Trophy className="size-3.5" />
                Logros ganados
              </div>
              <p className="text-3xl font-bold tabular-nums">
                {earnedCount}
                <span className="text-base text-muted-foreground font-normal">
                  {" "}/ {totalCount}
                </span>
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Star className="size-3.5" />
                Puntos totales
              </div>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {totalPoints}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                <Target className="size-3.5" />
                Progreso
              </div>
              <Progress value={pct} className="h-2.5" />
              <p className="text-xs text-muted-foreground">
                {pct.toFixed(0)}% completado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logros ganados (highlight) */}
      {mine.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h3 className="font-bold text-base">Logros desbloqueados</h3>
            <Badge className="bg-primary/15 text-primary">{mine.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mine.map((g) => (
              <EarnedAchievementCard key={g.id} grant={g} />
            ))}
          </div>
        </div>
      )}

      {/* Catálogo por tier */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : achievements.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No hay logros disponibles aún"
          description="El presidente aún no ha configurado logros. ¡Vuelve pronto!"
        />
      ) : (
        <div className="space-y-6">
          {ACHIEVEMENT_TIERS.map((tier) => {
            const items = byTier[tier.id] || [];
            if (items.length === 0) return null;
            return (
              <div key={tier.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{tier.emoji}</span>
                  <h3 className="font-bold text-base">{tier.label}</h3>
                  <Badge variant="outline" className="text-xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((a) => (
                    <LockedAchievementCard
                      key={a.id}
                      achievement={a}
                      earned={mineMap.get(a.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function EarnedAchievementCard({ grant }: { grant: VolunteerAchievement }) {
  const ach = grant.achievement;
  const tier = tierConfig(ach.tier);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden ring-1 transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
          tier.ring,
        )}
      >
        <div className={cn("h-2 bg-gradient-to-r", tier.gradient)} />
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ring-1",
                tier.bg,
                tier.text,
                tier.ring,
              )}
            >
              <span aria-hidden>{tier.emoji}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-base leading-tight">{ach.name}</h4>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={cn("text-[10px] py-0", tier.text)}>
                  {tier.label} · {ach.points} pts
                </Badge>
                {grant.automatic ? (
                  <Badge className="text-[10px] py-0 bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                    <Zap className="size-2.5 mr-0.5" /> Automático
                  </Badge>
                ) : (
                  <Badge className="text-[10px] py-0 bg-primary/15 text-primary">
                    <ShieldCheck className="size-2.5 mr-0.5" /> Otorgado
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {ach.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">{ach.description}</p>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border/60">
            <Calendar className="size-3" />
            Ganado el {formatDate(grant.createdAt)}
            {grant.grantedBy?.name && !grant.automatic && (
              <span className="truncate">· por {grant.grantedBy.name}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LockedAchievementCard({
  achievement,
  earned,
}: {
  achievement: Achievement;
  earned?: VolunteerAchievement;
}) {
  const tier = tierConfig(achievement.tier);
  const isEarned = !!earned;

  return (
    <Card
      className={cn(
        "relative overflow-hidden ring-1 transition-all duration-200",
        isEarned ? cn(tier.ring, "hover:shadow-md") : "ring-border/40 opacity-75 hover:opacity-100",
      )}
    >
      <div
        className={cn(
          "h-1.5",
          isEarned ? cn("bg-gradient-to-r", tier.gradient) : "bg-muted",
        )}
      />
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ring-1 relative",
              isEarned
                ? cn(tier.bg, tier.text, tier.ring)
                : "bg-muted text-muted-foreground ring-border/60 grayscale",
            )}
          >
            <span aria-hidden>{isEarned ? tier.emoji : "🔒"}</span>
            {!isEarned && (
              <div className="absolute inset-0 rounded-2xl bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                <Lock className="size-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-base leading-tight">{achievement.name}</h4>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] py-0", isEarned ? tier.text : "")}>
                {tier.label} · {achievement.points} pts
              </Badge>
              {achievement.auto && achievement.autoType !== "none" && (
                <Badge className="text-[10px] py-0 bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  <Zap className="size-2.5 mr-0.5" /> Auto
                </Badge>
              )}
            </div>
          </div>
        </div>
        {achievement.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {achievement.description}
          </p>
        )}
        <div className="pt-2 border-t border-border/60">
          {isEarned ? (
            <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <CheckCircle2 className="size-3.5" />
              Ganado el {formatDate(earned!.createdAt)}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="size-3" />
              {achievement.auto && achievement.autoType !== "none"
                ? `Criterio: ${autoCriteriaLabel(achievement.autoType)}${
                    AUTO_CRITERIA.find((c) => c.id === achievement.autoType)?.needsThreshold
                      ? ` ≥ ${achievement.autoThreshold}`
                      : ""
                  }`
                : "Lo otorga el presidente"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
