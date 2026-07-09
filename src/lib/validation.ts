/**
 * Utilidades de validación de campos para formularios de la aplicación.
 * Compartidas entre el frontend (feedback visual en tiempo real) y usadas
 * como referencia para los DTOs del backend (zod).
 *
 * Todas las funciones son puras y devuelven:
 *   - { valid: true } si el campo es válido
 *   - { valid: false, message: string } si es inválido (con mensaje legible)
 */

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/* ------------------------------------------------------------------ */
/* Carnet — exactamente 8 dígitos numéricos                            */
/* ------------------------------------------------------------------ */

/** Sanitiza el input del carnet: solo dígitos, máximo 8. */
export function sanitizeCarnet(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** Valida que el carnet tenga exactamente 8 dígitos numéricos. */
export function validateCarnet(value: string): ValidationResult {
  if (!value) {
    return { valid: false, message: "El carnet es requerido" };
  }
  if (!/^\d+$/.test(value)) {
    return { valid: false, message: "El carnet solo debe contener números" };
  }
  if (value.length < 8) {
    return {
      valid: false,
      message: `Faltan ${8 - value.length} dígito(s) — el carnet debe tener 8`,
    };
  }
  if (value.length > 8) {
    return { valid: false, message: "El carnet no puede tener más de 8 dígitos" };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Nombre completo — solo letras, espacios, acentos y apóstrofos      */
/* ------------------------------------------------------------------ */

/** Sanitiza el nombre: recorta espacios extra y limita a 120 chars. */
export function sanitizeName(value: string): string {
  return value.replace(/\s{2,}/g, " ").slice(0, 120);
}

const NAME_REGEX = /^[A-Za-zÁÉÍÓÚÜáéíóúüÑñÄËÏÖÜäëïöüÇç'’.\-\s]+$/;

export function validateName(value: string): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: "El nombre es requerido" };
  }
  if (trimmed.length < 3) {
    return { valid: false, message: "El nombre debe tener al menos 3 caracteres" };
  }
  if (trimmed.length > 120) {
    return { valid: false, message: "El nombre no puede exceder 120 caracteres" };
  }
  if (!NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      message: "El nombre solo puede contener letras, espacios y acentos",
    };
  }
  // Debe contener al menos un espacio (nombre + apellido) — recomendado
  if (!trimmed.includes(" ")) {
    return {
      valid: false,
      message: "Ingresa tu nombre completo (nombre y apellido)",
    };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Email — formato estándar (opcional)                                 */
/* ------------------------------------------------------------------ */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): ValidationResult {
  if (!value || !value.trim()) {
    return { valid: true }; // opcional
  }
  if (!EMAIL_REGEX.test(value.trim())) {
    return { valid: false, message: "Ingresa un email válido (ej. ana@esen.edu.sv)" };
  }
  if (value.length > 120) {
    return { valid: false, message: "El email es demasiado largo" };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Teléfono — formato salvadoreño (8 dígitos, opcional guion)         */
/* ------------------------------------------------------------------ */

/** Sanitiza el teléfono: solo dígitos, máximo 8. */
export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** Formatea el teléfono como XXXX-XXXX para mostrar. */
export function formatPhone(value: string): string {
  const digits = sanitizePhone(value);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function validatePhone(value: string): ValidationResult {
  if (!value || !value.trim()) {
    return { valid: true }; // opcional
  }
  const digits = sanitizePhone(value);
  if (digits.length !== 8) {
    return {
      valid: false,
      message: `El teléfono debe tener 8 dígitos (faltan ${8 - digits.length})`,
    };
  }
  // El primer dígito de un teléfono móvil SV suele ser 6 o 7; fijos 2.
  if (!/^[267]/.test(digits)) {
    return { valid: false, message: "Teléfono salvadoreño inválido" };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Contraseña — mín. 6, con indicador de fuerza                        */
/* ------------------------------------------------------------------ */

export type PasswordStrength = "weak" | "medium" | "strong";

export function passwordStrength(value: string): PasswordStrength {
  if (!value) return "weak";
  let score = 0;
  if (value.length >= 6) score++;
  if (value.length >= 10) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}

export function validatePassword(value: string): ValidationResult {
  if (!value) {
    return { valid: false, message: "La contraseña es requerida" };
  }
  if (value.length < 6) {
    return { valid: false, message: "La contraseña debe tener al menos 6 caracteres" };
  }
  if (value.length > 100) {
    return { valid: false, message: "La contraseña es demasiado larga" };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Helper: estado visual de campo para shadcn Input                    */
/* ------------------------------------------------------------------ */

/** Clases Tailwind para bordes según estado de validación. */
export function fieldBorderClass(state: "default" | "valid" | "invalid"): string {
  if (state === "valid") {
    return "border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/30";
  }
  if (state === "invalid") {
    return "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30";
  }
  return "";
}
