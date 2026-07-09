"use client";

import { useState, FormEvent, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { committeesApi, CAREERS, type Committee } from "@/lib/api";
import { BrandLogo } from "./BrandLogo";
import { Checkbox } from "@/components/ui/checkbox";
import {
  sanitizeCarnet,
  validateCarnet,
  sanitizeName,
  validateName,
  validateEmail,
  sanitizePhone,
  formatPhone,
  validatePhone,
  validatePassword,
  passwordStrength,
  fieldBorderClass,
  type ValidationResult,
} from "@/lib/validation";

/* ------------------------------------------------------------------ */
/* Helpers de UI                                                       */
/* ------------------------------------------------------------------ */

type FieldState = "default" | "valid" | "invalid";

/** Determina el estado visual de un campo a partir de su valor y validación. */
function fieldState(value: string, result: ValidationResult, touched: boolean): FieldState {
  if (!touched || !value) return "default";
  return result.valid ? "valid" : "invalid";
}

/** Mensaje de error pequeño bajo el campo. */
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertCircle className="size-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/** Check verde para campo válido. */
function ValidCheck({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none">
      <Check className="size-4" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Pantalla de Login / Registro                                        */
/* ------------------------------------------------------------------ */

export function LoginScreen() {
  const { login, register, bootstrap } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [committees, setCommittees] = useState<Committee[]>([]);

  // Login form state
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [remember, setRemember] = useState(true);

  // Register form state
  const [rName, setRName] = useState("");
  const [rStudentId, setRStudentId] = useState("");
  const [rCareer, setRCareer] = useState<string>(CAREERS[0]);
  const [rCommittee, setRCommittee] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [showRegPwd, setShowRegPwd] = useState(false);

  // Touch flags — el feedback de error solo aparece después de que el usuario
  // interactúa con el campo (onBlur o onChange post-primer-focus).
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    committeesApi
      .list()
      .then(setCommittees)
      .catch(() => {
        /* ignore — committees may be empty */
      });
  }, []);

  /* ---------------- Login handlers ---------------- */

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    const cleanCarnet = sanitizeCarnet(studentId);
    if (!cleanCarnet || !password) {
      toast.error("Ingrese su carnet y contraseña");
      return;
    }
    if (!/^\d{8}$/.test(cleanCarnet)) {
      toast.error("El carnet debe tener exactamente 8 dígitos");
      return;
    }
    setLoading(true);
    try {
      const user = await login(cleanCarnet, password, remember);
      toast.success(`Bienvenido(a), ${user.name}`);
      await bootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Register validations ---------------- */

  const nameValidation = useMemo(() => validateName(rName), [rName]);
  const carnetValidation = useMemo(() => validateCarnet(rStudentId), [rStudentId]);
  const emailValidation = useMemo(() => validateEmail(rEmail), [rEmail]);
  const phoneValidation = useMemo(() => validatePhone(rPhone), [rPhone]);
  const passwordValidation = useMemo(() => validatePassword(rPassword), [rPassword]);
  const pwdStrength = useMemo(() => passwordStrength(rPassword), [rPassword]);
  const committeeValidation = useMemo<ValidationResult>(
    () =>
      rCommittee
        ? { valid: true }
        : { valid: false, message: "Debes seleccionar un comité" },
    [rCommittee],
  );

  const isNameTouched = !!touched.rName;
  const isCarnetTouched = !!touched.rStudentId;
  const isEmailTouched = !!touched.rEmail;
  const isPhoneTouched = !!touched.rPhone;
  const isPwdTouched = !!touched.rPassword;
  const isCommitteeTouched = !!touched.rCommittee;

  const nameState = fieldState(rName, nameValidation, isNameTouched);
  const carnetState = fieldState(rStudentId, carnetValidation, isCarnetTouched);
  const emailState = fieldState(rEmail, emailValidation, isEmailTouched);
  const phoneState = fieldState(rPhone, phoneValidation, isPhoneTouched);
  const pwdState = fieldState(rPassword, passwordValidation, isPwdTouched);
  const committeeState: FieldState =
    isCommitteeTouched && !rCommittee
      ? "invalid"
      : rCommittee
        ? "valid"
        : "default";

  const isFormValid =
    nameValidation.valid &&
    carnetValidation.valid &&
    emailValidation.valid &&
    phoneValidation.valid &&
    passwordValidation.valid &&
    committeeValidation.valid;

  const markTouched = (field: string) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    // Marcar todos como touched para mostrar todos los errores de una vez.
    setTouched({
      rName: true,
      rStudentId: true,
      rEmail: true,
      rPhone: true,
      rPassword: true,
      rCommittee: true,
    });
    if (!isFormValid) {
      toast.error("Revisa los campos marcados en rojo antes de continuar");
      return;
    }
    setLoading(true);
    try {
      const user = await register({
        name: rName.trim(),
        studentId: rStudentId.trim(),
        career: rCareer,
        committeeId: rCommittee,
        password: rPassword,
        email: rEmail || undefined,
        phone: sanitizePhone(rPhone) || undefined,
      });
      toast.success(`Cuenta creada. Bienvenido(a), ${user.name}`);
      await bootstrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- Strength bar config ---------------- */

  const strengthConfig = {
    weak: { label: "Débil", color: "bg-destructive", width: "w-1/3" },
    medium: { label: "Media", color: "bg-amber-500", width: "w-2/3" },
    strong: { label: "Fuerte", color: "bg-emerald-500", width: "w-full" },
  } as const;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-gradient-soft p-4">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="flex flex-col items-center mb-6">
          <BrandLogo size={104} className="mb-3 shadow-lg shadow-primary/10" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            EduTECH ESEN
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Gestión de Voluntarios y Horas Sociales
          </p>
        </div>

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              {mode === "login" ? (
                <LogIn className="size-5 text-primary" />
              ) : (
                <UserPlus className="size-5 text-primary" />
              )}
              <div>
                <CardTitle className="text-xl">
                  {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
                </CardTitle>
                <CardDescription>
                  {mode === "login"
                    ? "Ingresa con tu carnet y contraseña"
                    : "Regístrate como voluntario"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="studentId">Carnet</Label>
                  <Input
                    id="studentId"
                    value={studentId}
                    onChange={(e) => setStudentId(sanitizeCarnet(e.target.value))}
                    placeholder="Tu carnet (8 dígitos)"
                    inputMode="numeric"
                    autoComplete="username"
                    disabled={loading}
                    maxLength={8}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    8 dígitos numéricos · {studentId.length}/8
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showLoginPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showLoginPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showLoginPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                {/* Recuérdame — persiste la sesión hasta cerrar sesión explícita */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <label
                    htmlFor="remember"
                    className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                  >
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                      disabled={loading}
                    />
                    <span>Recuérdame</span>
                  </label>
                  <span
                    className="text-[11px] text-muted-foreground/80 hidden sm:inline"
                    title={
                      remember
                        ? "Tu sesión persistirá al cerrar el navegador"
                        : "Tu sesión se cerrará al cerrar la pestaña"
                    }
                  >
                    {remember ? "Sesión persistente" : "Sólo esta pestaña"}
                  </span>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LogIn className="size-4" />
                  )}
                  Iniciar sesión
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Nombre completo */}
                <div className="space-y-2">
                  <Label htmlFor="rName">Nombre completo</Label>
                  <div className="relative">
                    <Input
                      id="rName"
                      value={rName}
                      onChange={(e) => {
                        setRName(sanitizeName(e.target.value));
                        markTouched("rName");
                      }}
                      onBlur={() => markTouched("rName")}
                      placeholder="Ej. Ana López"
                      disabled={loading}
                      maxLength={120}
                      className={`pr-10 ${fieldBorderClass(nameState)}`}
                      aria-invalid={nameState === "invalid"}
                    />
                    <ValidCheck show={nameState === "valid"} />
                  </div>
                  {nameState === "invalid" ? (
                    <FieldError message={nameValidation.message} />
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Nombre y apellido · solo letras
                    </p>
                  )}
                </div>

                {/* Carnet + Carrera */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rStudentId">Carnet (8 dígitos)</Label>
                    <div className="relative">
                      <Input
                        id="rStudentId"
                        value={rStudentId}
                        onChange={(e) => {
                          setRStudentId(sanitizeCarnet(e.target.value));
                          markTouched("rStudentId");
                        }}
                        onBlur={() => markTouched("rStudentId")}
                        placeholder="20241234"
                        inputMode="numeric"
                        disabled={loading}
                        maxLength={8}
                        className={`pr-10 font-mono tracking-wider ${fieldBorderClass(carnetState)}`}
                        aria-invalid={carnetState === "invalid"}
                      />
                      <ValidCheck show={carnetState === "valid"} />
                    </div>
                    {carnetState === "invalid" ? (
                      <FieldError message={carnetValidation.message} />
                    ) : (
                      <p
                        className={`text-[11px] ${
                          rStudentId.length === 8
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {rStudentId.length}/8 dígitos · solo números
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rCareer">Carrera</Label>
                    <Select value={rCareer} onValueChange={setRCareer} disabled={loading}>
                      <SelectTrigger id="rCareer" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAREERS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Comité — obligatorio */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="rCommittee">Comité</Label>
                    <span className="text-[11px] text-destructive font-medium">Obligatorio</span>
                  </div>
                  <Select
                    value={rCommittee}
                    onValueChange={(v) => {
                      setRCommittee(v);
                      markTouched("rCommittee");
                    }}
                    disabled={loading || committees.length === 0}
                  >
                    <SelectTrigger
                      id="rCommittee"
                      className={`w-full ${fieldBorderClass(committeeState)}`}
                      aria-invalid={committeeState === "invalid"}
                    >
                      <SelectValue placeholder="Selecciona un comité" />
                    </SelectTrigger>
                    <SelectContent>
                      {committees.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          No hay comités disponibles
                        </SelectItem>
                      ) : (
                        committees.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: c.color || "#94a3b8" }}
                              />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {committeeState === "invalid" ? (
                    <FieldError message={committeeValidation.message} />
                  ) : committeeState === "valid" ? (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="size-3" />
                      Comité seleccionado
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Elige el comité al que pertenecerás como voluntario
                    </p>
                  )}
                </div>

                {/* Contraseña */}
                <div className="space-y-2">
                  <Label htmlFor="rPassword">Contraseña (mín. 6)</Label>
                  <div className="relative">
                    <Input
                      id="rPassword"
                      type={showRegPwd ? "text" : "password"}
                      value={rPassword}
                      onChange={(e) => {
                        setRPassword(e.target.value);
                        markTouched("rPassword");
                      }}
                      onBlur={() => markTouched("rPassword")}
                      placeholder="••••••••"
                      disabled={loading}
                      maxLength={100}
                      className={`pr-10 ${fieldBorderClass(pwdState)}`}
                      aria-invalid={pwdState === "invalid"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showRegPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showRegPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {pwdState === "invalid" ? (
                    <FieldError message={passwordValidation.message} />
                  ) : (
                    rPassword && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${strengthConfig[pwdStrength].color} ${strengthConfig[pwdStrength].width}`}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">
                            {strengthConfig[pwdStrength].label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Usa mayúsculas, números y símbolos para mayor seguridad
                        </p>
                      </div>
                    )
                  )}
                </div>

                {/* Email + Teléfono */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rEmail">Email (opcional)</Label>
                    <div className="relative">
                      <Input
                        id="rEmail"
                        type="email"
                        value={rEmail}
                        onChange={(e) => {
                          setREmail(e.target.value);
                          markTouched("rEmail");
                        }}
                        onBlur={() => markTouched("rEmail")}
                        placeholder="ana@esen.edu.sv"
                        disabled={loading}
                        maxLength={120}
                        className={`pr-10 ${fieldBorderClass(emailState)}`}
                        aria-invalid={emailState === "invalid"}
                      />
                      <ValidCheck show={emailState === "valid" && !!rEmail} />
                    </div>
                    <FieldError message={emailState === "invalid" ? emailValidation.message : undefined} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rPhone">Teléfono (opcional)</Label>
                    <div className="relative">
                      <Input
                        id="rPhone"
                        value={formatPhone(rPhone)}
                        onChange={(e) => {
                          // Extrae solo dígitos del input (ignora el guion del formato)
                          setRPhone(sanitizePhone(e.target.value));
                          markTouched("rPhone");
                        }}
                        onBlur={() => markTouched("rPhone")}
                        placeholder="7000-0000"
                        inputMode="tel"
                        disabled={loading}
                        maxLength={9}
                        className={`pr-10 ${fieldBorderClass(phoneState)}`}
                        aria-invalid={phoneState === "invalid"}
                      />
                      <ValidCheck show={phoneState === "valid" && !!rPhone} />
                    </div>
                    {phoneState === "invalid" ? (
                      <FieldError message={phoneValidation.message} />
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        8 dígitos SV · formato 0000-0000
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={loading || !isFormValid}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Registrarme
                </Button>
                {!isFormValid && (
                  <p className="text-[11px] text-center text-muted-foreground">
                    Completa todos los campos requeridos para habilitar el registro
                  </p>
                )}
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <div className="text-center text-sm text-muted-foreground w-full">
              {mode === "login" ? (
                <>
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-primary font-medium hover:underline"
                  >
                    Regístrate
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-primary font-medium hover:underline"
                  >
                    Inicia sesión
                  </button>
                </>
              )}
            </div>
          </CardFooter>
        </Card>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary/70" />
            Plataforma de gestión interna · EduTECH ESEN
          </p>
        </div>
      </div>
    </div>
  );
}
