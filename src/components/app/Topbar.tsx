"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu, Search, Bell, Keyboard } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import {
  ROLE_LABELS,
  ROLE_BADGE_COLORS,
  isPrivileged,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { navItem, type SectionId } from "./nav";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  active: SectionId;
  onOpenMobileNav: () => void;
  onNavigate: (section: SectionId) => void;
  onOpenShortcutsHelp?: () => void;
}

export function Topbar({ active, onOpenMobileNav, onNavigate, onOpenShortcutsHelp }: TopbarProps) {
  const { user, logout } = useAuthStore();
  const item = navItem(active);
  const [searchSignal, setSearchSignal] = useState(0);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNav}
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight truncate">
          {item.label}
        </h1>
        <p className="text-xs text-muted-foreground truncate hidden sm:block">
          {item.description}
        </p>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Search button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setSearchSignal((s) => s + 1)}
          aria-label="Buscar"
        >
          <Search className="size-5" />
        </Button>

        {/* Keyboard shortcuts help button — discoverable entry point */}
        {onOpenShortcutsHelp && (
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 hidden sm:inline-flex"
            onClick={onOpenShortcutsHelp}
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
          >
            <Keyboard className="size-5" />
          </Button>
        )}

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications bell */}
        <NotificationsBell />

        {/* User menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 gap-2 px-2 sm:px-3">
                <span className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                  {user.name?.charAt(0)?.toUpperCase() || "?"}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight gap-0.5">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium max-w-[120px] truncate">
                      {user.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1.5 text-[10px] leading-none shrink-0",
                        ROLE_BADGE_COLORS[user.role],
                      )}
                    >
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.studentId}
                  </span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span className="font-medium truncate">{user.name}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {user.email || user.studentId}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-1 w-fit text-[10px] leading-none py-0.5",
                    ROLE_BADGE_COLORS[user.role],
                  )}
                >
                  {ROLE_LABELS[user.role]}
                </Badge>
                {isPrivileged(user.role) && (
                  <span className="text-[10px] text-muted-foreground font-normal mt-0.5">
                    Acceso completo (finanzas + admin)
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onNavigate("perfil")}
              >
                <Bell className="size-4" />
                Mi perfil
              </DropdownMenuItem>
              {onOpenShortcutsHelp && (
                <DropdownMenuItem
                  className="cursor-pointer sm:hidden"
                  onClick={onOpenShortcutsHelp}
                >
                  <Keyboard className="size-4" />
                  Atajos de teclado
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => logout()}
                className="cursor-pointer"
              >
                <LogOut className="size-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <GlobalSearch onNavigate={onNavigate} openSignal={searchSignal} />
    </header>
  );
}
