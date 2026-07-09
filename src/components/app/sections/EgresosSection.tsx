"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Receipt,
  Loader2,
  TrendingDown,
  CreditCard,
  Banknote,
  Building2,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  expenseApi,
  activitiesApi,
  formatCurrency,
  formatDate,
  isPrivileged,
  type Expense,
  type ExpenseSummary,
  type Activity,
  type PaymentMethod,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight } from "../Shared";

const CATEGORIES = [
  "Materiales",
  "Alimentos",
  "Transporte",
  "Equipos",
  "Software",
  "Eventos",
  "Servicios",
  "Otros",
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "transferencia", label: "Transferencia", icon: Building2 },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "cheque", label: "Cheque", icon: Receipt },
];

const PAYMENT_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cheque: "Cheque",
};

export function EgresosSection() {
  const { user } = useAuthStore();
  // Pueden registrar/editar/eliminar egresos: admin, presidente,
  // vicepresidente y líder de comité (todos los roles privilegiados).
  const isAdmin = isPrivileged(user?.role);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [list, sum, acts] = await Promise.all([
        expenseApi.list(),
        expenseApi.summary(),
        activitiesApi.list(),
      ]);
      setExpenses(list);
      setSummary(sum);
      setActivities(acts);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar egresos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(e: Expense) {
    try {
      await expenseApi.remove(e.id);
      toast.success("Egreso eliminado");
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  const maxCat = useMemo(() => {
    if (!summary || summary.byCategory.length === 0) return 1;
    return Math.max(...summary.byCategory.map((c) => c.amount), 1);
  }, [summary]);

  // Filtrado client-side (accent-insensitive)
  const filteredExpenses = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(searchTerm.trim());
    return expenses.filter((e) => {
      if (fromDate && (e.date || "").slice(0, 10) < fromDate) return false;
      if (toDate && (e.date || "").slice(0, 10) > toDate) return false;
      if (categoryFilter !== "all" && (e.category || "") !== categoryFilter) return false;
      if (q) {
        const haystack = norm(
          `${e.concept} ${e.beneficiary || ""} ${e.category || ""} ${e.notes || ""} ${e.activity?.title || ""}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, fromDate, toDate, searchTerm, categoryFilter]);

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses],
  );

  const hasFilters = fromDate || toDate || searchTerm.trim() || categoryFilter !== "all";

  function setPreset(preset: "month" | "quarter" | "year" | "clear") {
    if (preset === "clear") {
      setFromDate("");
      setToDate("");
      return;
    }
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let start: Date;
    if (preset === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (preset === "quarter") start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    else start = new Date(now.getFullYear(), 0, 1);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <SectionHeader
        title="Egresos"
        description={`${filteredExpenses.length} de ${expenses.length} registro(s) · ${formatCurrency(filteredTotal)}`}
        action={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white h-11"
            >
              <Plus className="size-4" /> Registrar gasto
            </Button>
          ) : null
        }
      />

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
              <Filter className="size-4" />
              <span>Filtrar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              <div className="space-y-1">
                <Label htmlFor="e-from" className="text-xs">Desde</Label>
                <Input
                  id="e-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-to" className="text-xs">Hasta</Label>
                <Input
                  id="e-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-cat" className="text-xs">Categoría</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger id="e-cat" className="h-9 w-full">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="e-search" className="text-xs">Buscar</Label>
                <Input
                  id="e-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Concepto, beneficiario…"
                  className="h-9"
                  aria-label="Buscar egresos"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPreset("month")}>
                Este mes
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPreset("quarter")}>
                3 meses
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={() => setPreset("year")}>
                Este año
              </Button>
              {hasFilters && (
                <Button size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => { setPreset("clear"); setSearchTerm(""); setCategoryFilter("all"); }}>
                  <X className="size-3.5" /> Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="ring-1 ring-rose-500/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <TrendingDown className="size-4" />
              <p className="text-xs font-medium">Total egresos</p>
            </div>
            <p className="text-3xl font-bold mt-1">
              {summary ? formatCurrency(summary.total) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Receipt className="size-4" />
              <p className="text-xs font-medium">Número de registros</p>
            </div>
            <p className="text-3xl font-bold mt-1">
              {summary ? summary.count : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="size-4" />
              <p className="text-xs font-medium">Por método de pago</p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : summary && summary.byPaymentMethod.length > 0 ? (
              <ul className="space-y-1.5 max-h-32 overflow-y-auto scroll-thin">
                {summary.byPaymentMethod.map((m) => (
                  <li key={m.method} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{PAYMENT_LABEL[m.method] || m.method}</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">
                Sin datos por método
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Categorías breakdown */}
      {summary && summary.byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingDown className="size-4 text-rose-600" />
              <p className="text-xs font-medium">Distribución por categoría</p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.byCategory.map((c) => (
                <li key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{c.category || "Sin categoría"}</span>
                    <span className="tabular-nums text-rose-700 dark:text-rose-400">
                      {formatCurrency(c.amount)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full transition-all"
                      style={{ width: `${(c.amount / maxCat) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredExpenses.length === 0 ? (
            <EmptyState
              icon={hasFilters ? Filter : Receipt}
              title={hasFilters ? "Sin resultados" : "Sin egresos"}
              description={hasFilters ? "No hay egresos que coincidan con los filtros aplicados." : "Registra el primer gasto de la asociación."}
            />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="min-w-[200px]">Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Beneficiario</TableHead>
                    <TableHead>Actividad</TableHead>
                    {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((e) => (
                    <TableRow key={e.id} className="transition-colors hover:bg-rose-50/40 dark:hover:bg-rose-950/10">
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(e.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Highlight text={e.concept} query={searchTerm} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                        {formatCurrency(e.amount)}
                      </TableCell>
                      <TableCell>
                        {e.category ? (
                          <Badge variant="secondary" className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            <Highlight text={e.category} query={searchTerm} />
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {PAYMENT_LABEL[e.paymentMethod || ""] || e.paymentMethod || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <Highlight text={e.beneficiary || "—"} query={searchTerm} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        <Highlight text={e.activity?.title || "—"} query={searchTerm} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => {
                                setEditing(e);
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
                              onClick={() => setDeleteTarget(e)}
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

      <ExpenseFormDialog
        open={formOpen}
        editing={editing}
        activities={activities}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await expenseApi.update(editing.id, data);
              toast.success("Egreso actualizado");
            } else {
              await expenseApi.create(data as Parameters<typeof expenseApi.create>[0]);
              toast.success("Gasto registrado");
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
            <AlertDialogTitle>¿Eliminar egreso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el gasto{" "}
              <span className="font-medium">
                {deleteTarget && formatCurrency(deleteTarget.amount)}
              </span>{" "}
              ({deleteTarget?.concept}).
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

interface ExpenseFormData {
  date?: string;
  concept: string;
  amount: number;
  category?: string;
  paymentMethod?: PaymentMethod;
  beneficiary?: string;
  notes?: string;
  activityId?: string | null;
}

function ExpenseFormDialog({
  open,
  editing,
  activities,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: Expense | null;
  activities: Activity[];
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: ExpenseFormData) => void | Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("0");
  const [category, setCategory] = useState("none");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");
  const [activityId, setActivityId] = useState("none");

  useEffect(() => {
    if (open) {
      setDate(editing?.date ? editing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setConcept(editing?.concept || "");
      setAmount(String(editing?.amount ?? 0));
      setCategory(editing?.category || "none");
      setPaymentMethod((editing?.paymentMethod as PaymentMethod) || "efectivo");
      setBeneficiary(editing?.beneficiary || "");
      setNotes(editing?.notes || "");
      setActivityId(editing?.activityId || "none");
    }
  }, [open, editing]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (concept.trim().length < 2) {
      toast.error("El concepto debe tener al menos 2 caracteres");
      return;
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      toast.error("El monto debe ser un número válido");
      return;
    }
    onSubmit({
      date: date || undefined,
      concept: concept.trim(),
      amount: amt,
      category: category === "none" ? undefined : category,
      paymentMethod,
      beneficiary: beneficiary.trim() || undefined,
      notes: notes.trim() || undefined,
      activityId: activityId === "none" ? null : activityId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar gasto" : "Registrar gasto"}
          </DialogTitle>
          <DialogDescription>
            Registra un egreso económico de la asociación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="e-concept">Concepto</Label>
            <Input
              id="e-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Refrigerios para taller"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-amount">Monto (USD)</Label>
              <Input
                id="e-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-date">Fecha</Label>
              <Input
                id="e-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-category">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="e-category" className="w-full">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-payment">Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger id="e-payment" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-beneficiary">Beneficiario / proveedor</Label>
            <Input
              id="e-beneficiary"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="Ej. Panadería La Esperanza"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-activity">Actividad asociada (opcional)</Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger id="e-activity" className="w-full">
                <SelectValue placeholder="Sin actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin actividad</SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-notes">Notas</Label>
            <Textarea
              id="e-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
              className="bg-rose-600 hover:bg-rose-700 text-white"
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
