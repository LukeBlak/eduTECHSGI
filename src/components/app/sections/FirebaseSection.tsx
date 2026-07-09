"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Flame,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  PlugZap,
  ShieldCheck,
  AlertTriangle,
  Eye,
  EyeOff,
  Server,
  Clock,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  Sparkles,
  Info,
  FileJson,
  Users,
  Network,
  CalendarDays,
  Wallet,
  Receipt,
  Clock3,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { firebaseApi, type FirebaseConfigClient, type FirebaseStatus, type SyncResult, type SyncLogEntry } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { SectionHeader } from "../Shared";

const COLLECTION_META = [
  { key: "committees", label: "Comités", icon: Network, color: "#10616D" },
  { key: "volunteers", label: "Voluntarios", icon: Users, color: "#00B0B7" },
  { key: "activities", label: "Actividades", icon: CalendarDays, color: "#5FEAFF" },
  { key: "socialHours", label: "Horas Sociales", icon: Clock3, color: "#0ea5e9" },
  { key: "incomes", label: "Ingresos", icon: Wallet, color: "#10b981" },
  { key: "expenses", label: "Egresos", icon: Receipt, color: "#f43f5e" },
] as const;

export function FirebaseSection() {
  const { toast } = useToast();
  const [config, setConfig] = useState<FirebaseConfigClient | null>(null);
  const [status, setStatus] = useState<FirebaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [loadingMock, setLoadingMock] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  // Form state
  const [form, setForm] = useState({
    projectId: "",
    clientEmail: "",
    privateKey: "",
    databaseUrl: "",
    enabled: false,
    mode: "mock" as "live" | "mock",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, st] = await Promise.all([firebaseApi.getConfig(), firebaseApi.status()]);
      setConfig(cfg);
      setStatus(st);
      setForm({
        projectId: cfg.projectId,
        clientEmail: cfg.clientEmail,
        privateKey: "",
        databaseUrl: cfg.databaseUrl,
        enabled: cfg.enabled,
        mode: cfg.mode,
      });
    } catch (e: any) {
      toast({
        title: "Error al cargar configuración",
        description: e?.message ?? "No se pudo obtener la configuración de Firebase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await firebaseApi.saveConfig({
        projectId: form.projectId,
        clientEmail: form.clientEmail,
        privateKey: form.privateKey,
        databaseUrl: form.databaseUrl,
        enabled: form.enabled,
        mode: form.mode,
      });
      toast({ title: "Configuración guardada", description: res.message });
      await load();
    } catch (e: any) {
      toast({
        title: "Error al guardar",
        description: e?.message ?? "No se pudo guardar la configuración",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await firebaseApi.test();
      setTestResult({ success: res.success, message: res.message });
      toast({
        title: res.success ? "Conexión exitosa" : "Conexión fallida",
        description: res.message,
        variant: res.success ? "default" : "destructive",
      });
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message ?? "Error de conexión" });
      toast({ title: "Error de conexión", description: e?.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setLastSync(null);
    try {
      const res = await firebaseApi.sync();
      setLastSync(res);
      if (res.success) {
        const total = Object.values(res.counts).reduce((a, b) => a + b, 0);
        const pushedTotal = res.pushed ? Object.values(res.pushed).reduce((a, b) => a + b, 0) : 0;
        toast({
          title: "Sincronización completada",
          description:
            res.mode === "live"
              ? `Sincronización bidireccional: ${total} registros locales${pushedTotal > 0 ? ` · ${pushedTotal} documentos subidos a Firestore` : ""}.`
              : `${total} registros cargados desde Firebase (demo).`,
        });
      } else {
        toast({
          title: "Sincronización con errores",
          description: res.error ?? "Revisa el log para más detalles",
          variant: "destructive",
        });
      }
      await load();
    } catch (e: any) {
      toast({ title: "Error de sincronización", description: e?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    setLastSync(null);
    try {
      const res = await firebaseApi.push();
      setLastSync(res);
      if (res.success) {
        const total = Object.values(res.counts).reduce((a, b) => a + b, 0);
        toast({
          title: "Datos subidos a Firestore",
          description: `Se subieron ${total} documentos a tu proyecto de Firebase. Revisa la consola de Firestore para ver las colecciones.`,
        });
      } else {
        toast({
          title: "Error al subir datos",
          description: res.error ?? "Revisa el log para más detalles",
          variant: "destructive",
        });
      }
      await load();
    } catch (e: any) {
      toast({ title: "Error al subir", description: e?.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const handleLoadMock = async () => {
    setLoadingMock(true);
    setLastSync(null);
    try {
      const res = await firebaseApi.loadMock();
      setLastSync(res.result);
      toast({
        title: "Datos de demostración cargados",
        description: `${Object.values(res.result.counts).reduce((a, b) => a + b, 0)} registros cargados desde Firebase (mock). Los gráficos se actualizaron.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Error al cargar datos demo", description: e?.message, variant: "destructive" });
    } finally {
      setLoadingMock(false);
    }
  };

  const isConnected = status?.configured ?? false;
  const mode = form.mode;
  const lastSyncDate = status?.lastSyncAt ? new Date(status.lastSyncAt) : null;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Conexión con Firebase"
        description="Sincroniza comités, voluntarios, actividades, horas sociales, ingresos y egresos desde Firestore."
        action={
          <div className="flex items-center gap-2">
            <ConnectionBadge connected={isConnected} mode={mode} />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        }
      />

      {/* Hero status card */}
      <Card className="relative overflow-hidden border-primary/20">
        <div className="absolute inset-0 bg-brand-gradient-soft pointer-events-none" />
        <CardContent className="relative p-6 grid gap-6 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-brand-gradient flex items-center justify-center shadow-md shadow-primary/20">
                <Flame className="size-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">Estado de la conexión</h3>
                <p className="text-sm text-muted-foreground">
                  {mode === "mock"
                    ? "Modo demostración — datos de ejemplo simulando Firestore"
                    : `Proyecto: ${form.projectId || "—"}`}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <StatusPill
                label="Modo"
                value={mode === "mock" ? "Demostración" : "Producción (Live)"}
                icon={mode === "mock" ? Sparkles : Server}
                tone={mode === "mock" ? "graphite" : "primary"}
              />
              <StatusPill
                label="Última sincronización"
                value={lastSyncDate ? lastSyncDate.toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) : "Nunca"}
                icon={Clock}
                tone={status?.lastSyncStatus === "success" ? "primary" : status?.lastSyncStatus === "error" ? "rose" : "muted"}
              />
            </div>
            {status?.lastSyncStatus === "error" && status.error && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="size-4" />
                <AlertDescription className="text-xs">{status.error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Sync actions */}
          <div className="flex flex-col gap-2 justify-center">
            <Button
              onClick={handleSync}
              disabled={syncing || pushing || loading}
              className="bg-brand-gradient hover:opacity-90 text-white h-11 text-base font-semibold shadow-md shadow-primary/20"
            >
              {syncing ? <Loader2 className="size-5 animate-spin" /> : <ArrowLeftRight className="size-5" />}
              {syncing ? "Sincronizando..." : "Sincronizar (bidireccional)"}
            </Button>
            <Button
              onClick={handlePush}
              disabled={pushing || syncing || loading || mode === "mock"}
              variant="outline"
              className="h-10 border-primary/40 text-primary hover:bg-primary/10"
              title={mode === "mock" ? "Cambia a modo Live para subir datos a Firestore" : "Sube todos los datos locales a Firestore"}
            >
              {pushing ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              {pushing ? "Subiendo..." : "Subir a Firestore"}
            </Button>
            <Button
              onClick={handleLoadMock}
              disabled={loadingMock || syncing || pushing || loading}
              variant="outline"
              className="h-10 border-primary/30 text-primary hover:bg-primary/5"
            >
              {loadingMock ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Cargar datos de demostración
            </Button>
            <p className="text-[11px] text-muted-foreground text-center pt-1 leading-relaxed">
              {mode === "live" ? (
                <>
                  <span className="font-medium text-primary">Sincronizar</span> hace pull (Firestore → local) y push (local → Firestore).
                  {" "}
                  <span className="font-medium text-primary">Subir a Firestore</span> solo sube tus datos locales, creando las colecciones en tu Firebase.
                </>
              ) : (
                <>La sincronización en modo demo carga datos de ejemplo. Cambia a <span className="font-medium">Live</span> para conectar tu Firebase real.</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Synced data counts */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Database className="size-4" />
          Datos sincronizados por colección
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {COLLECTION_META.map((col) => {
            const count = status?.counts?.[col.key] ?? 0;
            const Icon = col.icon;
            return (
              <Card key={col.key} className="relative overflow-hidden ring-1 ring-border/60 hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div
                    className="size-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${col.color}1a`, color: col.color }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: col.color }}>
                      {loading ? <Skeleton className="h-7 w-8 mx-auto" /> : count}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{col.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Configuration form */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileJson className="size-4 text-primary" />
                  Credenciales de service account
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Configura el acceso a Firestore con tu service account JSON de Firebase.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="mode-live" className="text-xs font-medium cursor-pointer">
                  {form.mode === "live" ? "Live" : "Mock"}
                </Label>
                <Switch
                  id="mode-live"
                  checked={form.mode === "live"}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, mode: v ? "live" : "mock" }))}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="projectId" className="text-xs">Project ID</Label>
                    <Input
                      id="projectId"
                      placeholder="edutech-esen-prod"
                      value={form.projectId}
                      onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                      className="h-9"
                      disabled={form.mode === "mock"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clientEmail" className="text-xs">Client Email</Label>
                    <Input
                      id="clientEmail"
                      placeholder="firebase-adminsdk@edutech-esen.iam.gserviceaccount.com"
                      value={form.clientEmail}
                      onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
                      className="h-9 text-xs"
                      disabled={form.mode === "mock"}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="databaseUrl" className="text-xs">Database URL (opcional)</Label>
                  <Input
                    id="databaseUrl"
                    placeholder="https://edutech-esen-prod.firebaseio.com"
                    value={form.databaseUrl}
                    onChange={(e) => setForm((f) => ({ ...f, databaseUrl: e.target.value }))}
                    className="h-9 text-xs"
                    disabled={form.mode === "mock"}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="privateKey" className="text-xs">Private Key</Label>
                    {config?.hasPrivateKey && (
                      <span className="text-[10px] text-primary flex items-center gap-1">
                        <ShieldCheck className="size-3" />
                        Configurada
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Textarea
                      id="privateKey"
                      placeholder={config?.hasPrivateKey ? config.privateKeyHint || "•••••••• (deja vacío para mantener)" : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                      value={form.privateKey}
                      onChange={(e) => setForm((f) => ({ ...f, privateKey: e.target.value }))}
                      className="font-mono text-[11px] h-24 resize-none pr-10"
                      type={showPrivateKey ? "text" : "password"}
                      disabled={form.mode === "mock"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 size-7"
                      onClick={() => setShowPrivateKey((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPrivateKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Pega la clave privada completa del JSON de tu service account. Se almacena localmente.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <PlugZap className="size-4 text-primary" />
                    <div>
                      <p className="text-xs font-medium">Conexión activa</p>
                      <p className="text-[10px] text-muted-foreground">Habilita la sincronización automática</p>
                    </div>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={handleSave} disabled={saving} size="sm">
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                    Guardar configuración
                  </Button>
                  <Button
                    onClick={handleTest}
                    disabled={testing || form.mode === "mock"}
                    variant="outline"
                    size="sm"
                  >
                    {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
                    Probar conexión
                  </Button>
                </div>

                {testResult && (
                  <Alert variant={testResult.success ? "default" : "destructive"} className="py-2">
                    {testResult.success ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Sync log + flow */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="size-4 text-secondary" />
                Flujo de sincronización
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: Flame, label: "Firestore (Firebase)", desc: "Colecciones: committees, volunteers, activities, socialHours, incomes, expenses", color: "#FFA000" },
                { icon: ArrowRight, label: "Pull → Prisma (SQLite local)", desc: "Upsert por clave natural, dedupe por fecha+concepto", color: "#00B0B7" },
                { icon: Database, label: "APIs existentes", desc: "Dashboard, reportes y gráficos leen de Prisma", color: "#10616D" },
              ].map((step, i, arr) => {
                const Icon = step.icon;
                const isArrow = i === arr.length - 2;
                return (
                  <div key={i}>
                    <div className="flex items-start gap-3">
                      <div
                        className="size-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${step.color}1a`, color: step.color }}
                      >
                        <Icon className={`size-4 ${isArrow ? "rotate-90" : ""}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight">{step.label}</p>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <Separator className="my-2 ml-4 w-[calc(100%-2rem)]" />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Sync log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4 text-primary" />
                Registro de sincronización
              </CardTitle>
              <CardDescription className="text-xs">
                {lastSync ? `Última ejecución: ${new Date(lastSync.finishedAt).toLocaleTimeString("es-SV")}` : "Sin sincronizaciones aún"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-y-auto scroll-thin space-y-1.5 pr-1">
                {lastSync && lastSync.log.length > 0 ? (
                  lastSync.log.map((entry, i) => <SyncLogRow key={i} entry={entry} />)
                ) : status?.log && status.log.length > 0 ? (
                  status.log.map((entry, i) => <SyncLogRow key={i} entry={entry} />)
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Info className="size-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      Ejecuta una sincronización para ver el detalle aquí.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Info note */}
      <Alert>
        <Info className="size-4" />
        <AlertTitle className="text-sm">¿Cómo funciona?</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          La sincronización es <strong>unidireccional (Firestore → base local)</strong>: lee las 6 colecciones de tu base de
          datos de Firebase y las replica en el sistema mediante <em>upsert</em> (inserta o actualiza según la clave natural
          de cada colección). Una vez sincronizados, todos los <strong>gráficos del Dashboard y Reportes</strong> reflejan
          automáticamente los datos, ya que consumen las APIs existentes que leen de la base local. Usa el{" "}
          <strong>modo demostración (mock)</strong> para probar el flujo completo sin credenciales reales.
        </AlertDescription>
      </Alert>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function ConnectionBadge({ connected, mode }: { connected: boolean; mode: "live" | "mock" }) {
  return (
    <Badge
      variant="outline"
      className={
        connected
          ? mode === "live"
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-graphite-500/40 bg-graphite-500/10 text-graphite-600 dark:text-graphite-400"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
      }
    >
      <span className="size-1.5 rounded-full bg-current animate-soft-pulse mr-1.5" />
      {connected ? (mode === "live" ? "Conectado (Live)" : "Modo demo") : "Desconectado"}
    </Badge>
  );
}

function StatusPill({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: "primary" | "graphite" | "rose" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    graphite: "text-graphite-600 dark:text-graphite-400 bg-graphite-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    muted: "text-muted-foreground bg-muted/50",
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-xs font-semibold truncate leading-tight">{value}</p>
      </div>
    </div>
  );
}

function SyncLogRow({ entry }: { entry: SyncLogEntry }) {
  const isOk = entry.count >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-2.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-xs"
    >
      <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">{entry.collection}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {new Date(entry.timestamp).toLocaleTimeString("es-SV")}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {entry.detail ?? `${entry.action} · ${entry.count} registro(s)`}
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">
        {isOk ? `+${entry.count}` : entry.count}
      </Badge>
    </motion.div>
  );
}
