"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Loader2,
  TrendingUp,
  Receipt,
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
  incomeApi,
  formatCurrency,
  formatDate,
  isPrivileged,
  type Income,
  type IncomeSummary,
} from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { SectionHeader, EmptyState, Highlight } from "../Shared";

const CATEGORIES = [
  "Donación",
  "Cuota",
  "Venta",
  "Patrocinio",
  "Recaudación",
  "Otro",
];

export function IngresosSection() {
  const { user } = useAuthStore();
  // Pueden registrar/editar/eliminar ingresos: admin, presidente,
  // vicepresidente y líder de comité (todos los roles privilegiados).
  const isAdmin = isPrivileged(user?.role);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        incomeApi.list(),
        incomeApi.summary(),
      ]);
      setIncomes(list);
      setSummary(sum);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al cargar ingresos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(i: Income) {
    try {
      await incomeApi.remove(i.id);
      toast.success("Ingreso eliminado");
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

  // Filtrado client-side por fecha y búsqueda (accent-insensitive)
  const filteredIncomes = useMemo(() => {
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(searchTerm.trim());
    return incomes.filter((i) => {
      if (fromDate && (i.date || "").slice(0, 10) < fromDate) return false;
      if (toDate && (i.date || "").slice(0, 10) > toDate) return false;
      if (q) {
        const haystack = norm(
          `${i.concept} ${i.source || ""} ${i.category || ""} ${i.notes || ""}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [incomes, fromDate, toDate, searchTerm]);

  const filteredTotal = useMemo(
    () => filteredIncomes.reduce((s, i) => s + i.amount, 0),
    [filteredIncomes],
  );

  const hasFilters = fromDate || toDate || searchTerm.trim();

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
        title="Ingresos"
        description={`${filteredIncomes.length} de ${incomes.length} registro(s) · ${formatCurrency(filteredTotal)}`}
        action={
          isAdmin ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground h-11"
            >
              <Plus className="size-4" /> Registrar ingreso
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
              <div className="space-y-1">
                <Label htmlFor="i-from" className="text-xs">Desde</Label>
                <Input
                  id="i-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-to" className="text-xs">Hasta</Label>
                <Input
                  id="i-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-search" className="text-xs">Buscar</Label>
                <Input
                  id="i-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Concepto, fuente, categoría…"
                  className="h-9"
                  aria-label="Buscar ingresos"
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
                <Button size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => { setPreset("clear"); setSearchTerm(""); }}>
                  <X className="size-3.5" /> Limpiar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="ring-1 ring-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-primary">
              <Wallet className="size-4" />
              <p className="text-xs font-medium">Total ingresos</p>
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
              <TrendingUp className="size-4" />
              <p className="text-xs font-medium">Por categoría</p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : summary && summary.byCategory.length > 0 ? (
              <ul className="space-y-1.5 max-h-32 overflow-y-auto scroll-thin">
                {summary.byCategory.map((c) => (
                  <li key={c.category} className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{c.category || "Sin categoría"}</span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(c.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(c.amount / maxCat) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">
                Sin datos por categoría
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredIncomes.length === 0 ? (
            <EmptyState
              icon={hasFilters ? Filter : Wallet}
              title={hasFilters ? "Sin resultados" : "Sin ingresos"}
              description={hasFilters ? "No hay ingresos que coincidan con los filtros aplicados." : "Registra el primer ingreso de la asociación."}
            />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="min-w-[200px]">Concepto</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="min-w-[140px]">Notas</TableHead>
                    {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncomes.map((i) => (
                    <TableRow key={i.id} className="transition-colors hover:bg-accent/40">
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(i.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Highlight text={i.concept} query={searchTerm} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-primary">
                        {formatCurrency(i.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <Highlight text={i.source || "—"} query={searchTerm} />
                      </TableCell>
                      <TableCell>
                        {i.category ? (
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            <Highlight text={i.category} query={searchTerm} />
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        <Highlight text={i.notes || "—"} query={searchTerm} />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => {
                                setEditing(i);
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
                              onClick={() => setDeleteTarget(i)}
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

      <IncomeFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={setFormOpen}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true);
          try {
            if (editing) {
              await incomeApi.update(editing.id, data);
              toast.success("Ingreso actualizado");
            } else {
              await incomeApi.create(data as Parameters<typeof incomeApi.create>[0]);
              toast.success("Ingreso registrado");
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
            <AlertDialogTitle>¿Eliminar ingreso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro de{" "}
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

interface IncomeFormData {
  date?: string;
  concept: string;
  amount: number;
  source?: string;
  category?: string;
  notes?: string;
}

function IncomeFormDialog({
  open,
  editing,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  editing: Income | null;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (data: IncomeFormData) => void | Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("none");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDate(editing?.date ? editing.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setConcept(editing?.concept || "");
      setAmount(String(editing?.amount ?? 0));
      setSource(editing?.source || "");
      setCategory(editing?.category || "none");
      setNotes(editing?.notes || "");
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
      source: source.trim() || undefined,
      category: category === "none" ? undefined : category,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar ingreso" : "Registrar ingreso"}
          </DialogTitle>
          <DialogDescription>
            Registra un ingreso económico de la asociación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="i-concept">Concepto</Label>
            <Input
              id="i-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Cuota mensual voluntarios"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="i-amount">Monto (USD)</Label>
              <Input
                id="i-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-date">Fecha</Label>
              <Input
                id="i-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="i-source">Fuente</Label>
              <Input
                id="i-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Ej. Banco Cuscatlán"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-category">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="i-category" className="w-full">
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="i-notes">Notas</Label>
            <Textarea
              id="i-notes"
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
