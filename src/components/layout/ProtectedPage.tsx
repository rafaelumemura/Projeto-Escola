"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { BillingUsage } from "@/lib/billing/plans";

export function ProtectedPage({
  title,
  subtitle,
  actions,
  children
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user, supabase } = useAuth();
  const [usage, setUsage] = useState<BillingUsage | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ usage: BillingUsage }>(supabase, "/api/billing/usage")
      .then((data) => setUsage(data.usage))
      .catch(() => setUsage(null));
  }, [supabase, user]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="panel p-6 text-center">
          <p className="text-sm font-semibold text-ink">Carregando Projeto Escola...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (usage?.status === "suspended" && pathname !== "/perfil" && pathname !== "/planos") {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl rounded-lg border border-clay/25 bg-white p-6 text-center shadow-soft">
          <h1 className="text-2xl font-bold text-ink">Acesso suspenso</h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">{usage.message || "Regularize seu plano para continuar usando o app."}</p>
          <Link href="/planos" className="mt-5 inline-flex btn-primary">
            Ver planos
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label mb-2">Projeto Escola</p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/65">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
      </div>
      {children}
    </AppShell>
  );
}
