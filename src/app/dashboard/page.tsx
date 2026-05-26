"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, FolderKanban, Sparkles } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];

export default function DashboardPage() {
  const { supabase, profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities"),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans")
    ])
      .then(([activityData, collectionData, planData]) => {
        setActivities(activityData.activities.slice(0, 4));
        setCollections(collectionData.collections);
        setPlans(planData.weekly_plans);
      })
      .catch(() => undefined);
  }, [supabase]);

  return (
    <ProtectedPage
      title={`Olá, ${profile?.name || "professor(a)"}`}
      subtitle="Organize sua rotina pedagógica com atividades geradas por IA, coleções e planejamentos mensais."
      actions={
        <Link href="/gerar" className="btn-primary">
          <Sparkles size={17} />
          Gerar nova atividade
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={<BookOpen size={22} />} label="Atividades salvas" value={activities.length} href="/atividades" />
        <SummaryCard icon={<FolderKanban size={22} />} label="Coleções" value={collections.length} href="/colecoes" />
        <SummaryCard icon={<CalendarDays size={22} />} label="Planejamentos mensais" value={plans.length} href="/planejamento" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Últimas atividades geradas</h2>
            <Link href="/atividades" className="text-sm font-semibold text-leaf">
              Ver todas
            </Link>
          </div>

          <div className="space-y-3">
            {activities.length ? (
              activities.map((activity) => (
                <Link
                  key={activity.id}
                  href="/atividades"
                  className="block rounded-lg border border-ink/10 bg-white p-4 transition hover:border-leaf/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-ink">{activity.title}</h3>
                      <p className="mt-1 text-sm text-ink/60">
                        {activity.age_range || "Faixa etária"} • {activity.development_area || "Área"}
                      </p>
                    </div>
                    <ArrowRight className="text-ink/35" size={18} />
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-ink/20 p-6 text-center">
                <p className="text-sm font-semibold text-ink/70">Nenhuma atividade salva ainda.</p>
                <Link href="/gerar" className="mt-3 inline-flex btn-primary">
                  <Sparkles size={16} />
                  Criar primeira atividade
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-bold">Acesso rápido</h2>
          <div className="mt-4 space-y-2">
            {[
              { href: "/atividades", label: "Consultar atividades", icon: BookOpen },
              { href: "/colecoes", label: "Organizar coleções", icon: FolderKanban },
              { href: "/planejamento", label: "Montar planejamento", icon: CalendarDays }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md border border-ink/10 bg-white px-3 py-3 text-sm font-semibold transition hover:border-leaf/40">
                  <Icon size={18} className="text-leaf" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </ProtectedPage>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  href
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="panel block p-5 transition hover:-translate-y-0.5 hover:border-leaf/40">
      <div className="flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-leaf">{icon}</span>
        <ArrowRight size={18} className="text-ink/35" />
      </div>
      <p className="mt-5 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-semibold text-ink/60">{label}</p>
    </Link>
  );
}
