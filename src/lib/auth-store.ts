/**
 * Auth store — Zustand con persistencia manual en localStorage (token + user).
 * Verifica el token contra /api/auth/verify en el arranque.
 */
"use client";

import { create } from "zustand";
import {
  authApi,
  setToken,
  getToken,
  setRememberMe,
  volunteersApi,
  type AuthUser,
  type VerifyResponse,
} from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  login: (studentId: string, password: string, remember?: boolean) => Promise<AuthUser>;
  register: (body: {
    name: string;
    studentId: string;
    career: string;
    committeeId: string;
    password: string;
    email?: string;
    phone?: string;
  }) => Promise<AuthUser>;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  status: "loading",

  async bootstrap() {
    const token = getToken();
    if (!token) {
      set({ status: "unauthenticated", token: null, user: null });
      return;
    }
    try {
      const verifyRes: VerifyResponse = await authApi.verify();
      if (verifyRes.valid && verifyRes.user) {
        const jwtUser = verifyRes.user;
        set({
          token,
          status: "authenticated",
          user: {
            id: jwtUser.userId,
            name: jwtUser.name,
            studentId: jwtUser.studentId,
            role: jwtUser.role,
            career: "",
            email: "",
            phone: "",
            committeeId: null,
            committee: null,
          },
        });
        // Refetch full volunteer info in the background to enrich the user object.
        // Usamos volunteersApi.get(userId) en vez de list() — get() requiere solo
        // auth (no privilegio), mientras que list() expone todos los voluntarios.
        try {
          const me = await volunteersApi.get(jwtUser.userId);
          if (me) {
            // Strip password si viniera incluido (defensivo — el backend ya
            // sanitiza, pero no confiamos ciegamente).
            const { password: _pw, ...meSafe } = me as { password?: string };
            set({ user: meSafe as AuthUser });
          }
        } catch {
          /* ignore — keep minimal user */
        }
      } else {
        setToken(null);
        set({ status: "unauthenticated", token: null, user: null });
      }
    } catch {
      setToken(null);
      set({ status: "unauthenticated", token: null, user: null });
    }
  },

  async login(studentId, password, remember = true) {
    // Establecer la preferencia "Recuérdame" ANTES de guardar el token,
    // para que setToken use el almacén correcto (localStorage vs sessionStorage).
    setRememberMe(remember);
    const res = await authApi.login({ studentId, password });
    if (!res.success) {
      throw new Error(res.message || "Error al iniciar sesión");
    }
    setToken(res.token);
    set({ token: res.token, user: res.user, status: "authenticated" });
    return res.user;
  },

  async register(body) {
    const res = await authApi.register(body);
    if (!res.success) {
      throw new Error(res.message || "Error al registrar");
    }
    setToken(res.token);
    set({ token: res.token, user: res.user, status: "authenticated" });
    return res.user;
  },

  logout() {
    setToken(null);
    set({ token: null, user: null, status: "unauthenticated" });
  },
}));
