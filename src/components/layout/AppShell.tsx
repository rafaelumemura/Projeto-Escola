"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  School,
  Sparkles,
  UserRound,
  UsersRound
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/gerar", label: "Gerar", icon: Sparkles },
  { href: "/atividades", label: "Atividades", icon: BookOpen },
  { href: "/colecoes", label: "Coleções", icon: FolderKanban },
  { href: "/alunos?view=classes", label: "Turmas", icon: School },
  { href: "/alunos?view=students", label: "Alunos", icon: UsersRound },
  { href: "/relatorios", label: "Relatórios", icon: FileText },
  { href: "/planejamento", label: "Planejamento", icon: CalendarDays }
];

const mobileNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/gerar", label: "Gerar", icon: Sparkles },
  { href: "/atividades", label: "Atividades", icon: BookOpen },
  { href: "/colecoes", label: "Coleções", icon: FolderKanban },
  { href: "/alunos?view=classes", label: "Turmas", icon: School },
  { href: "/alunos?view=students", label: "Alunos", icon: UsersRound },
  { href: "/relatorios", label: "Relatórios", icon: FileText },
  { href: "/planejamento", label: "Planejar", icon: CalendarDays }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profile, signOut, usage } = useAuth();
  const { theme } = useTheme();
  const desktopLogoSrc = theme === "dark" ? "/logo-horizontal-dark.webp" : "/logo-horizontal.png";
  const mobileLogoSrc = theme === "dark" ? "/logo-horizontal-dark.webp" : "/logo-horizontal.png";
  const desktopLogoClass = "h-32 max-w-[236px]";
  const mobileLogoClass = "h-14 max-w-[calc(100vw-112px)]";

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink/10 bg-white px-4 py-5 lg:flex">
        <Link href="/dashboard" className="flex items-center justify-start px-3">
          <img src={desktopLogoSrc} alt="Projeto Escola" className={`${desktopLogoClass} object-contain object-left`} />
        </Link>

        <nav className="mt-4 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActiveNavItem(pathname, searchParams, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  active ? "bg-mint text-leaf" : "text-ink/70 hover:bg-paper hover:text-ink"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white p-2.5">
            <Link href="/perfil" className="flex min-w-0 flex-1 items-center gap-3 transition hover:opacity-80">
              <Avatar src={profile?.avatar_url} name={profile?.name || profile?.email || "Perfil"} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{profile?.name || "Professor(a)"}</span>
                <span className="block truncate text-xs font-semibold text-ink/50">{usage?.plan_name || planLabel(profile?.plan)}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink/45 transition hover:bg-paper hover:text-clay"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-white/95 px-4 py-1.5 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex min-w-0 items-center">
              <img src={mobileLogoSrc} alt="Projeto Escola" className={`${mobileLogoClass} object-contain object-left`} />
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/perfil" className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-ink/10 bg-white">
                <Avatar src={profile?.avatar_url} name={profile?.name || profile?.email || "Perfil"} compact />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-40 pt-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-ink/10 bg-white/95 px-2 py-2 shadow-[0_-12px_35px_rgba(39,50,44,0.08)] backdrop-blur lg:hidden">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = isActiveNavItem(pathname, searchParams, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold ${
                  active ? "bg-mint text-leaf" : "text-ink/65"
                }`}
              >
                <Icon size={17} />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function isActiveNavItem(pathname: string, searchParams: { get: (name: string) => string | null }, href: string) {
  const [itemPath, query = ""] = href.split("?");
  if (pathname !== itemPath) return false;
  const itemView = new URLSearchParams(query).get("view");
  if (!itemView) return true;
  const currentView = searchParams.get("view");
  return currentView === itemView || (!currentView && itemView === "classes");
}

function planLabel(plan?: string | null) {
  if (plan === "free") return "Gratuito";
  if (plan === "basic") return "Básico";
  if (plan === "complete") return "Completo";
  if (plan === "pro") return "Pro";
  return "Plano não informado";
}

function Avatar({ src, name, compact = false }: { src?: string | null; name: string; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const sizeClass = compact ? "h-full w-full text-xs" : "h-11 w-11 text-sm";

  if (src) {
    return <img src={src} alt={name} className={`${sizeClass} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-mint font-bold text-leaf`}>
      {initials || <UserRound size={18} />}
    </span>
  );
}
