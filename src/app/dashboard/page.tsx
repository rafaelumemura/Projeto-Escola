"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, FolderKanban, Sparkles } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type PlannedItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};

export default function DashboardPage() {
  const { supabase, profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityCount, setActivityCount] = useState(0);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [nextPlannedItem, setNextPlannedItem] = useState<PlannedItem | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities"),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans")
    ])
      .then(async ([activityData, collectionData, planData]) => {
        setActivityCount(activityData.activities.length);
        setActivities(activityData.activities.slice(0, 4));
        setCollections(collectionData.collections);
        const details = await Promise.all(
          planData.weekly_plans.map((plan) =>
            apiFetch<{ items: PlannedItem[] }>(supabase, `/api/weekly-plans/${plan.id}`).catch(() => ({ items: [] }))
          )
        );
        setNextPlannedItem(findNextPlannedItem(details.flatMap((detail) => detail.items)));
      })
      .catch(() => undefined);
  }, [supabase]);

  return (
    <ProtectedPage
      title={`Olá, ${profile?.name || "professor(a)"}`}
      subtitle="Organize sua rotina pedagógica com atividades geradas por IA, coleções e planejamentos."
      actions={
        <Link href="/gerar" className="btn-primary">
          <Sparkles size={17} />
          Gerar nova atividade
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard icon={<BookOpen size={22} />} label="Atividades salvas" value={activityCount} href="/atividades" />
        <SummaryCard icon={<FolderKanban size={22} />} label="Coleções" value={collections.length} href="/colecoes" />
      </div>

      <div className="mt-6 space-y-6">
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Próximas atividades planejadas</h2>
            <Link href="/planejamento" className="text-sm font-semibold text-leaf">
              Ver planejamento
            </Link>
          </div>

          {nextPlannedItem ? (
            <Link href="/planejamento" className="block rounded-lg border border-ink/10 bg-white p-4 transition hover:border-leaf/40">
              <div className="flex flex-wrap items-center gap-3">
                <span className="badge">
                  <CalendarDays size={14} />
                  {formatPlannedDateTime(nextPlannedItem)}
                </span>
                <h3 className="font-bold text-ink">{nextPlannedItem.activities?.title || "Atividade planejada"}</h3>
              </div>
              {nextPlannedItem.activities?.development_area ? (
                <p className="mt-2 text-sm text-ink/60">{nextPlannedItem.activities.development_area}</p>
              ) : null}
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-ink/20 bg-white p-5 text-sm font-semibold text-ink/60">
              Nenhuma atividade planejada nos próximos dias.
            </div>
          )}
        </section>

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
                  <h3 className="font-bold text-ink">{activity.title}</h3>
                  <p className="mt-1 text-sm text-ink/60">
                    {activity.age_range || "Faixa etária"} • {activity.development_area || "Área"}
                  </p>
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
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-leaf">{icon}</span>
      <p className="mt-5 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-semibold text-ink/60">{label}</p>
    </Link>
  );
}

function findNextPlannedItem(items: PlannedItem[]) {
  const now = new Date();
  const upcoming = items
    .filter((item) => item.date)
    .map((item) => ({ item, date: parsePlannedDate(item) }))
    .filter((entry): entry is { item: PlannedItem; date: Date } => {
      if (!entry.date) return false;
      return entry.date >= now;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcoming[0]?.item || null;
}

function parsePlannedDate(item: PlannedItem) {
  const [year, month, day] = item.date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hour = 0, minute = 0] = (item.start_time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function formatPlannedDateTime(item: PlannedItem) {
  const date = parsePlannedDate(item);
  if (!date) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
