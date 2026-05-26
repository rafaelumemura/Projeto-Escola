"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Sparkles,
  UserRound
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/gerar", label: "Gerar", icon: Sparkles },
  { href: "/atividades", label: "Atividades", icon: BookOpen },
  { href: "/colecoes", label: "Coleções", icon: FolderKanban },
  { href: "/planejamento", label: "Planejamento", icon: CalendarDays },
  { href: "/perfil", label: "Perfil", icon: UserRound }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink/10 bg-white/90 px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-leaf text-white">
            <GraduationCap size={22} />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink">Projeto Escola</span>
            <span className="block text-xs text-ink/55">Atividades com IA</span>
          </span>
        </Link>

        <nav className="mt-8 space-y-1">
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

        <div className="absolute bottom-5 left-4 right-4">
          <div className="rounded-lg border border-ink/10 bg-paper p-3">
            <p className="text-sm font-semibold text-ink">{profile?.name || "Professor(a)"}</p>
            <p className="truncate text-xs text-ink/55">{profile?.email}</p>
          </div>
          <button onClick={handleSignOut} className="mt-3 w-full btn-secondary">
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold">
              <GraduationCap size={22} className="text-leaf" />
              Projeto Escola
            </Link>
            <button onClick={handleSignOut} className="btn-secondary px-3">
              <LogOut size={16} />
            </button>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                    active ? "bg-leaf text-white" : "bg-white text-ink/70"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
