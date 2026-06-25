"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  FolderKanban,
  LibraryBig,
  PartyPopper,
  Sparkles,
  Target
} from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"] & {
  collection_ids?: string[];
  primary_collection_id?: string | null;
};
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];
type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type PlannedItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};

const statAccents = ["#00B3AF", "#2F80ED", "#C98117", "#FF4F64"];

export default function DashboardPage() {
  const { supabase, profile, usage } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [registeredActivityCount, setRegisteredActivityCount] = useState(0);
  const [generatedActivityCount, setGeneratedActivityCount] = useState(0);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [plannedItems, setPlannedItems] = useState<PlannedItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    Promise.all([
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities"),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans")
    ])
      .then(async ([activityData, collectionData, planData]) => {
        const generatedActivities = activityData.activities.filter(isGeneratedActivity);
        setRegisteredActivityCount(activityData.activities.length);
        setGeneratedActivityCount(generatedActivities.length);
        setActivities(generatedActivities.slice(0, 5));
        setCollections(collectionData.collections);
        const details = await Promise.all(
          planData.weekly_plans.map((plan) =>
            apiFetch<{ items: PlannedItem[] }>(supabase, `/api/weekly-plans/${plan.id}`).catch(() => ({ items: [] }))
          )
        );
        setPlannedItems(details.flatMap((detail) => detail.items));
      })
      .catch(() => undefined);

    async function loadStudents() {
      try {
        const { data } = await supabase
          .from("students")
          .select("*")
          .eq("status", "active");
        setStudents(data || []);
      } catch {
        setStudents([]);
      }
    }

    void loadStudents();
  }, [supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const futurePlannedItems = useMemo(() => findFuturePlannedItems(plannedItems, now), [now, plannedItems]);
  const nextPlannedItems = useMemo(() => futurePlannedItems.slice(0, 5).map((entry) => entry.item), [futurePlannedItems]);
  const todayItems = useMemo(() => plannedItems.filter((item) => isSameDay(parsePlannedDate(item), now)), [now, plannedItems]);
  const birthdayStudents = useMemo(() => birthdaysThisMonth(students, now), [now, students]);
  const generatedCount = Math.max(usage?.generated_count ?? 0, generatedActivityCount);

  return (
    <ProtectedPage title="Dashboard" hideHeader>
      <section className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-leaf sm:text-sm">{formatHeroDate(now)}</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Olá, {profile?.name || "professor(a)"}
            </h1>
            <p className="mt-3 text-base font-semibold leading-7 text-ink/55 sm:text-lg">
              {todayItems.length
                ? `Você tem ${todayItems.length} ${todayItems.length === 1 ? "atividade planejada" : "atividades planejadas"} para hoje.`
                : "Você não tem atividades planejadas para hoje."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          href="/atividades"
          icon={<LibraryBig size={22} />}
          label="Atividades cadastradas"
          value={registeredActivityCount}
          accent={statAccents[0]}
        />
        <StatCard
          href="/atividades"
          icon={<BookOpen size={22} />}
          label="Atividades geradas"
          value={generatedCount}
          accent={statAccents[1]}
        />
        <StatCard
          href="/colecoes"
          icon={<FolderKanban size={22} />}
          label="Coleções"
          value={collections.length}
          accent={statAccents[2]}
        />
        <StatCard
          href="/planejamento"
          icon={<CalendarDays size={22} />}
          label="Atividades planejadas"
          value={futurePlannedItems.length}
          accent={statAccents[3]}
        />
      </section>

      <section className="mt-6">
        <BirthdayPanel students={birthdayStudents} today={now} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <UpcomingPanel items={nextPlannedItems} />
        <MiniCalendar date={now} items={plannedItems} />
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-ink">Últimas atividades geradas</h2>
          <Link href="/atividades" className="text-sm font-bold text-leaf">
            Ver todas
          </Link>
        </div>

        {activities.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activities.map((activity, index) => (
              <DashboardActivityCard
                key={activity.id}
                activity={activity}
                collections={collections}
                accent={activityAccent(activity, collections, index)}
              />
            ))}
          </div>
        ) : (
          <div className="panel border-dashed p-8 text-center">
            <p className="text-sm font-semibold text-ink/70">Nenhuma atividade salva ainda.</p>
            <Link href="/gerar" className="mt-4 inline-flex btn-primary">
              <Sparkles size={16} />
              Criar primeira atividade
            </Link>
          </div>
        )}
      </section>
    </ProtectedPage>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  accent
}: {
  icon: ReactNode;
  label: string;
  value: number;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="panel group block overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-leaf/35 sm:p-5"
      style={{ borderTop: `5px solid ${accent}` }}
    >
      <div className="flex items-center gap-4">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border sm:h-12 sm:w-12"
          style={{
            borderColor: `${accent}33`,
            backgroundColor: `${accent}18`,
            color: accent
          }}
        >
          {icon}
        </span>
        <span className="text-3xl font-bold leading-none text-ink sm:text-4xl">{value}</span>
      </div>
      <p className="mt-4 text-sm font-bold leading-5 text-ink/58 sm:max-w-32">{label}</p>
    </Link>
  );
}

function BirthdayPanel({ students, today }: { students: Student[]; today: Date }) {
  const todayBirthdays = students.filter((student) => {
    const birthday = birthdayDate(student.birth_date, today.getFullYear());
    return Boolean(birthday && isSameDay(birthday, today));
  });

  return (
    <section className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <PartyPopper size={17} className="shrink-0 text-[#FF4F64]" />
          <p className="truncate text-sm font-bold text-ink">
            Aniversariantes do mês
            <span className="ml-2 font-semibold text-ink/55">{students.length ? birthdaySummary(students, today) : `Nenhum em ${monthTitle(today)}`}</span>
          </p>
        </div>
        {todayBirthdays.length ? (
          <span className="shrink-0 rounded-full bg-[#FF4F64] px-2.5 py-1 text-xs font-bold text-white">
            Hoje: {todayBirthdays.map((student) => student.name).join(", ")}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function birthdaySummary(students: Student[], today: Date) {
  const firstStudents = students.slice(0, 3).map((student) => {
    const birthday = birthdayDate(student.birth_date, today.getFullYear());
    return `${student.name}${birthday ? ` (${formatBirthdayDay(birthday)})` : ""}`;
  });

  if (students.length > 3) {
    return `${firstStudents.join(", ")} e mais ${students.length - 3}`;
  }

  return firstStudents.join(", ");
}

function UpcomingPanel({ items }: { items: PlannedItem[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="shrink-0 text-leaf" />
          <h2 className="text-xl font-bold text-ink">Próximas atividades</h2>
        </div>
        <Link href="/planejamento" className="text-sm font-bold text-leaf">
          Ver planejamento
        </Link>
      </div>

      {items.length ? (
        <div className="divide-y divide-ink/10">
          {items.map((item, index) => (
            <UpcomingActivityCard key={item.id} item={item} accent={statAccents[index % statAccents.length]} />
          ))}
        </div>
      ) : (
        <div className="p-5 text-sm font-semibold text-ink/60">Nenhuma atividade planejada nos próximos dias.</div>
      )}
    </section>
  );
}

function UpcomingActivityCard({ item, accent }: { item: PlannedItem; accent: string }) {
  const date = parsePlannedDate(item);
  return (
    <Link href="/planejamento" className="grid gap-4 px-5 py-4 transition hover:bg-mint/25 sm:grid-cols-[96px_1fr]">
      <div className="flex items-center gap-3 sm:block">
        <p className="text-xs font-bold uppercase tracking-wide text-ink/35">{date ? shortWeekday(date) : "Data"}</p>
        <p className="text-lg font-bold text-leaf">{date ? formatTime(date) : "--:--"}</p>
      </div>
      <div className="min-w-0 border-l-4 pl-4" style={{ borderColor: accent }}>
        <h3 className="truncate text-base font-bold text-ink">{item.activities?.title || "Atividade planejada"}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink/58">
          {item.activities?.development_area || item.notes || "Sem área informada"}
        </p>
      </div>
    </Link>
  );
}

function MiniCalendar({ date, items }: { date: Date; items: PlannedItem[] }) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = monthStart.getDay();
  const days = Array.from({ length: leadingEmptyDays + monthDays }, (_, index) => {
    const day = index - leadingEmptyDays + 1;
    return day > 0 ? new Date(date.getFullYear(), date.getMonth(), day) : null;
  });
  const weekItems = groupItemsByDate(currentWeekItems(items, date));

  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-center gap-2">
        <CalendarDays size={18} className="shrink-0 text-leaf" />
        <h2 className="text-xl font-bold text-ink">{monthTitle(date)}</h2>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
          <span key={`${day}-${index}`} className="text-xs font-bold uppercase text-ink/35">
            {day}
          </span>
        ))}
        {days.map((day, index) => {
          const itemCount = day ? itemsOnDate(items, day).length : 0;
          const today = isSameDay(day, date);
          return (
            <span key={day?.toISOString() || `empty-${index}`} className="grid min-h-12 place-items-center">
              {day ? (
                <span
                  className={`relative grid h-11 w-11 place-items-center rounded-lg text-sm font-bold ${
                    today ? "bg-leaf text-white" : "text-ink/70"
                  }`}
                >
                  {day.getDate()}
                  {itemCount ? (
                    <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${today ? "bg-white" : "bg-leaf"}`} />
                  ) : null}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

      <div className="mt-6">
        <p className="text-sm font-bold text-ink">Esta semana</p>
        {weekItems.length ? (
          <div className="mt-3 space-y-2">
            {weekItems.map((item, index) => (
              <div key={item.key} className="flex items-center gap-3 text-sm font-semibold text-ink/62">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statAccents[index % statAccents.length] }} />
                <span>
                  {item.label} — {item.count} {item.count === 1 ? "atividade" : "atividades"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-ink/50">Nenhuma atividade nesta semana.</p>
        )}
      </div>
    </section>
  );
}

function DashboardActivityCard({
  activity,
  collections,
  accent
}: {
  activity: Activity;
  collections: Collection[];
  accent: string;
}) {
  const activityCollections = activityCollectionsFor(activity, collections);
  const summary = firstParagraph(activity.description);
  return (
    <Link href={`/atividades?atividade=${activity.id}`} className="panel group overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-leaf/35">
      <div className="mb-4 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
      <p className="text-xs font-bold uppercase tracking-wide text-ink/40">
        {activityCollections.length ? activityCollections.map((collection) => collection.name).join(", ") : activity.development_area || "Sem coleção"}
      </p>
      <h3 className="mt-4 line-clamp-3 text-xl font-bold leading-7 text-ink">{activity.title}</h3>
      {summary ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/60">{summary}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-ink/52">
        <span className="inline-flex items-center gap-2">
          <BookOpen size={14} className="shrink-0 text-ink/35" />
          {activity.age_range || "Faixa etária"}
        </span>
        {activity.development_area ? (
          <span className="inline-flex items-center gap-2">
            <Target size={14} className="shrink-0 text-leaf" />
            {activity.development_area}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function findFuturePlannedItems(items: PlannedItem[], now: Date) {
  return items
    .filter((item) => item.date)
    .map((item) => ({ item, date: parsePlannedDate(item) }))
    .filter((entry): entry is { item: PlannedItem; date: Date } => {
      if (!entry.date) return false;
      return entry.date >= now;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function parsePlannedDate(item: PlannedItem) {
  const [year, month, day] = item.date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hour = 0, minute = 0] = (item.start_time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function formatHeroDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  })
    .format(date)
    .replace(",", "")
    .toUpperCase();
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function shortWeekday(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
}

function monthTitle(date: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function itemsOnDate(items: PlannedItem[], date: Date) {
  return items.filter((item) => isSameDay(parsePlannedDate(item), date));
}

function currentWeekItems(items: PlannedItem[], date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - date.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return items.filter((item) => {
    const plannedDate = parsePlannedDate(item);
    return Boolean(plannedDate && plannedDate >= start && plannedDate < end);
  });
}

function groupItemsByDate(items: PlannedItem[]) {
  const grouped = new Map<string, { key: string; label: string; count: number }>();
  for (const item of items) {
    const date = parsePlannedDate(item);
    if (!date) continue;
    const key = dateKey(date);
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
    } else {
      grouped.set(key, {
        key,
        label: new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(date).replace(".", ""),
        count: 1
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function birthdaysThisMonth(students: Student[], today: Date) {
  return students
    .filter((student) => {
      const birthday = birthdayDate(student.birth_date, today.getFullYear());
      return Boolean(birthday && birthday.getMonth() === today.getMonth());
    })
    .sort((a, b) => {
      const first = birthdayDate(a.birth_date, today.getFullYear());
      const second = birthdayDate(b.birth_date, today.getFullYear());
      if (!first || !second) return 0;
      return first.getDate() - second.getDate();
    });
}

function birthdayDate(value: string | null, year: number) {
  if (!value) return null;
  const [, month, day] = value.split("-").map(Number);
  if (!month || !day) return null;
  return new Date(year, month - 1, day, 12);
}

function formatBirthdayDay(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long"
  }).format(date);
}

function isSameDay(left: Date | null, right: Date | null) {
  if (!left || !right) return false;
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function firstParagraph(value: string | null) {
  return (value || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .find(Boolean) || "";
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityAccent(activity: Activity, collections: Collection[], index: number) {
  const primaryCollection = activityCollectionsFor(activity, collections)[0];
  return primaryCollection?.color || statAccents[index % statAccents.length];
}

function activityCollectionsFor(activity: Activity, collections: Collection[]) {
  return (activity.collection_ids || [])
    .map((id) => collections.find((collection) => collection.id === id))
    .filter((collection): collection is Collection => Boolean(collection));
}

function isGeneratedActivity(activity: Activity) {
  const raw = activity.raw_ai_response;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  return (raw as { manual?: unknown }).manual !== true;
}
