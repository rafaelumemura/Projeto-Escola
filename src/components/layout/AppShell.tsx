"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Crown,
  FolderKanban,
  LayoutDashboard,
  Sparkles,
  UserRound
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { BillingUsage } from "@/lib/billing/plans";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/gerar", label: "Gerar", icon: Sparkles },
  { href: "/atividades", label: "Atividades", icon: BookOpen },
  { href: "/colecoes", label: "Coleções", icon: FolderKanban },
  { href: "/planejamento", label: "Planejamento", icon: CalendarDays }
];

const mobileNav = [
  { href: "/gerar", label: "Gerar", icon: Sparkles },
  { href: "/atividades", label: "Atividades", icon: BookOpen },
  { href: "/colecoes", label: "Coleções", icon: FolderKanban },
  { href: "/planejamento", label: "Planejar", icon: CalendarDays },
  { href: "/perfil", label: "Perfil", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, usage } = useAuth();

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink/10 bg-white/90 px-4 py-5 lg:flex">
        <Link href="/dashboard" className="flex items-center px-2">
          <img src="/logo-horizontal.png" alt="Projeto Escola" className="h-24 max-w-[232px] object-contain" />
        </Link>

        <nav className="mt-6 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

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
          <UsageMeter usage={usage} />
          <Link href="/perfil" className="flex items-center gap-3 rounded-lg border border-ink/10 bg-paper p-3 transition hover:border-leaf/35">
            <Avatar src={profile?.avatar_url} name={profile?.name || profile?.email || "Perfil"} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{profile?.name || "Professor(a)"}</span>
              <span className="block truncate text-xs text-ink/55">{profile?.email}</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex min-w-0 items-center">
              <img src="/logo-horizontal.png" alt="Projeto Escola" className="h-16 max-w-[260px] object-contain" />
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/perfil" className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-ink/10 bg-white">
                <Avatar src={profile?.avatar_url} name={profile?.name || profile?.email || "Perfil"} compact />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-40 pt-5 sm:px-6 lg:px-8 lg:py-6">{children}</main>

        <div className="fixed inset-x-3 bottom-[76px] z-40 lg:hidden">
          <UsageMeter usage={usage} compact />
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink/10 bg-white/95 px-2 py-2 shadow-[0_-12px_35px_rgba(39,50,44,0.08)] backdrop-blur lg:hidden">
          {mobileNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold ${
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

function UsageMeter({ usage, compact = false }: { usage: BillingUsage | null; compact?: boolean }) {
  const limit = usage?.activity_limit || 0;
  const generated = usage?.generated_count || 0;
  const percent = limit > 0 ? Math.min(100, Math.round((generated / limit) * 100)) : 0;
  const shouldShowUpgrade = Boolean(usage && (usage.can_upgrade || !usage.can_generate));
  const actionLabel = usage?.can_upgrade ? "Fazer upgrade" : "Ver planos";

  if (compact) {
    return (
      <div className="rounded-md border border-ink/10 bg-white/95 px-3 py-2 shadow-[0_-10px_24px_rgba(39,50,44,0.08)] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold leading-tight text-ink">{usage?.plan_name || "Sem plano"}</p>
            <p className="truncate text-[11px] font-semibold leading-tight text-ink/60">
              {generated}/{limit} atividades geradas
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-bold leading-none text-ink/70">{percent}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-full rounded-full bg-leaf transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink">{usage?.plan_name || "Sem plano"}</p>
        </div>
        <Crown size={17} className="shrink-0 text-sun" />
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between gap-3 text-xs text-ink/60">
          <span>
            {generated}/{limit} atividades geradas
          </span>
          <span className="font-semibold text-ink/70">{percent}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span className="block h-full rounded-full bg-leaf transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {usage?.message && !compact ? <p className="mt-2 text-xs leading-5 text-ink/60">{usage.message}</p> : null}
      {shouldShowUpgrade ? (
        <Link href="/planos" className={`mt-3 w-full ${compact ? "hidden" : "btn-primary"}`}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
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
