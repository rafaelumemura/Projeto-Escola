"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
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
type EvolutionPoint = {
  key: string;
  label: string;
  shortLabel: string;
  count: number;
};

const statAccents = ["#00B3AF", "#2F80ED", "#C98117", "#FF4F64"];
type DashboardView = "activities" | "students";
type DashboardPeriod = "week" | "month";

export default function DashboardPage() {
  const { supabase, profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [generatedActivities, setGeneratedActivities] = useState<Activity[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [plannedItems, setPlannedItems] = useState<PlannedItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [dashboardView, setDashboardView] = useState<DashboardView>("activities");
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("week");

  useEffect(() => {
    Promise.all([
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities"),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans")
    ])
      .then(async ([activityData, collectionData, planData]) => {
        const generatedActivities = activityData.activities.filter(isGeneratedActivity);
        setGeneratedActivities(generatedActivities);
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
  const evolutionSeries = useMemo(
    () => buildEvolutionSeries(dashboardView === "activities" ? generatedActivities : students, now, dashboardPeriod === "week" ? 7 : 30),
    [dashboardPeriod, dashboardView, generatedActivities, now, students]
  );

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

      <EvolutionPanel
        view={dashboardView}
        period={dashboardPeriod}
        series={evolutionSeries}
        onViewChange={setDashboardView}
        onPeriodChange={setDashboardPeriod}
      />

      {dashboardView === "students" ? (
        <section className="mt-4">
          <BirthdayPanel students={birthdayStudents} today={now} />
        </section>
      ) : null}

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] lg:items-start">
        <div className="space-y-6">
          <UpcomingPanel items={nextPlannedItems} />
          <RecentActivitiesPanel activities={activities} collections={collections} />
        </div>
        <MiniCalendar date={now} items={plannedItems} />
      </section>
    </ProtectedPage>
  );
}

function EvolutionPanel({
  view,
  period,
  series,
  onViewChange,
  onPeriodChange
}: {
  view: DashboardView;
  period: DashboardPeriod;
  series: EvolutionPoint[];
  onViewChange: (view: DashboardView) => void;
  onPeriodChange: (period: DashboardPeriod) => void;
}) {
  const total = series.reduce((sum, point) => sum + point.count, 0);
  const max = Math.max(1, ...series.map((point) => point.count));
  const chartColor = view === "activities" ? "#00B3AF" : "#8B5CF6";

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="inline-flex w-full rounded-xl bg-ink/5 p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => onViewChange("activities")}
            className={`flex flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition sm:flex-none ${
              view === "activities" ? "bg-white text-ink shadow-sm ring-1 ring-ink/5" : "text-ink/55 hover:text-ink"
            }`}
          >
            Atividades geradas
          </button>
          <button
            type="button"
            onClick={() => onViewChange("students")}
            className={`flex flex-1 items-center justify-center rounded-lg px-4 py-2 text-sm font-bold transition sm:flex-none ${
              view === "students" ? "bg-white text-ink shadow-sm ring-1 ring-ink/5" : "text-ink/55 hover:text-ink"
            }`}
          >
            Alunos
          </button>
        </div>

        <label>
          <span className="sr-only">Filtrar período</span>
          <select value={period} onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)} className="input min-w-40 py-2">
            <option value="week">Última semana</option>
            <option value="month">Últimos 30 dias</option>
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-end gap-4 px-5 pb-3">
          <p className="text-4xl font-bold" style={{ color: chartColor }}>{total}</p>
          <p className="pb-1 text-sm font-semibold text-ink/45">no período</p>
        </div>

        <EvolutionLineChart series={series} max={max} color={chartColor} />

        {!total ? (
          <p className="px-5 pb-4 text-sm font-semibold text-ink/50">
            Nenhum registro encontrado neste período.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function BirthdayPanel({ students, today }: { students: Student[]; today: Date }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-2">
          <PartyPopper size={17} className="shrink-0 text-[#FF4F64]" />
          <p className="text-sm font-bold text-ink">Aniversariantes do mês</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {students.length ? (
            students.map((student) => {
              const birthday = birthdayDate(student.birth_date, today.getFullYear());
              const isToday = Boolean(birthday && isSameDay(birthday, today));
              return (
                <span
                  key={student.id}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    isToday ? "bg-[#FF4F64] text-white" : "border border-ink/10 bg-mint/50 text-ink/70"
                  }`}
                >
                  {student.name}{birthday ? ` • ${formatBirthdayDay(birthday)}` : ""}
                </span>
              );
            })
          ) : (
            <span className="rounded-full border border-ink/10 bg-paper px-2.5 py-1 text-xs font-bold text-ink/50">
              Nenhum em {monthTitle(today)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
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

function RecentActivitiesPanel({ activities, collections }: { activities: Activity[]; collections: Collection[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
        <h2 className="text-xl font-bold text-ink">Últimas atividades geradas</h2>
        <Link href="/atividades" className="text-sm font-bold text-leaf">Ver todas</Link>
      </div>
      {activities.length ? (
        <div className="divide-y divide-ink/10">
          {activities.map((activity, index) => (
            <DashboardActivityRow key={activity.id} activity={activity} collections={collections} accent={activityAccent(activity, collections, index)} />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm font-semibold text-ink/65">Nenhuma atividade salva ainda.</p>
          <Link href="/atividades?criar=ia" className="mt-4 inline-flex btn-primary"><Sparkles size={16} />Criar primeira atividade</Link>
        </div>
      )}
    </section>
  );
}

function DashboardActivityRow({
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
    <Link href={`/atividades?atividade=${activity.id}`} className="group block border-l-4 px-5 py-4 transition hover:bg-mint/20" style={{ borderLeftColor: accent }}>
      <div className="flex flex-wrap gap-2">
        <span className="rounded bg-paper px-2 py-1 text-[11px] font-bold uppercase text-ink/50">{activity.age_range || "Faixa etária"}</span>
        <span className="rounded bg-paper px-2 py-1 text-[11px] font-bold uppercase text-ink/50">
          {activityCollections.length ? activityCollections.map((collection) => collection.name).join(", ") : activity.development_area || "Sem coleção"}
        </span>
      </div>
      <h3 className="mt-2 text-base font-bold leading-6 text-ink group-hover:text-leaf">{activity.title}</h3>
      {summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink/60">{summary}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink/52">
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

function EvolutionLineChart({ series, max, color }: { series: EvolutionPoint[]; max: number; color: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 700;
  const height = 170;
  const chartTop = 12;
  const chartBottom = 142;
  const points = series.map((point, index) => ({
    x: series.length === 1 ? width / 2 : (index / (series.length - 1)) * width,
    y: chartBottom - (point.count / max) * (chartBottom - chartTop),
    point
  }));
  const line = smoothPath(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${chartBottom} L ${points[0].x} ${chartBottom} Z` : "";
  const gradientId = color === "#00B3AF" ? "activity-chart-gradient" : "student-chart-gradient";
  const hoveredPoint = hoveredIndex === null ? null : points[hoveredIndex];
  const slotWidth = width / Math.max(1, series.length);
  const tooltipWidth = 76;
  const tooltipHeight = 52;
  const tooltipX = hoveredPoint ? Math.max(4, Math.min(width - tooltipWidth - 4, hoveredPoint.x - tooltipWidth / 2)) : 0;
  const tooltipY = hoveredPoint ? (hoveredPoint.y > 68 ? hoveredPoint.y - 62 : hoveredPoint.y + 12) : 0;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Evolução no período" onMouseLeave={() => setHoveredIndex(null)}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[36, 72, 108, 142].map((y) => <line key={y} x1="0" y1={y} x2={width} y2={y} stroke="currentColor" className="text-ink/10" strokeWidth="1" />)}
          {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
          {line ? <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {points.map(({ x, y, point }, index) => (
            <g key={point.key}>
              {point.count ? <circle cx={x} cy={y} r="4.5" fill={color} stroke="white" strokeWidth="2" /> : null}
              <rect
                x={Math.max(0, x - slotWidth / 2)}
                y="0"
                width={Math.min(slotWidth, width - Math.max(0, x - slotWidth / 2))}
                height={chartBottom + 12}
                fill="transparent"
                tabIndex={0}
                aria-label={`${point.label}: ${point.count}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              />
            </g>
          ))}
          {hoveredPoint ? (
            <g pointerEvents="none">
              <line x1={hoveredPoint.x} y1="0" x2={hoveredPoint.x} y2={chartBottom} stroke={color} strokeOpacity="0.35" strokeDasharray="4 4" />
              <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5" fill={color} stroke="white" strokeWidth="2" />
              <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="9" fill="#111827" />
              <text x={tooltipX + 12} y={tooltipY + 19} fill="#cbd5e1" fontSize="10" fontWeight="600">{hoveredPoint.point.shortLabel}</text>
              <text x={tooltipX + 12} y={tooltipY + 40} fill={color} fontSize="18" fontWeight="800">{hoveredPoint.point.count}</text>
            </g>
          ) : null}
        </svg>
        <div className="grid -mt-8 px-1 pb-4" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
          {series.map((point, index) => {
            const show = series.length <= 7 || index === 0 || index === series.length - 1 || index % 5 === 0;
            return <span key={point.key} className="text-center text-[10px] font-semibold text-ink/40">{show ? point.shortLabel : ""}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function buildEvolutionSeries(items: Array<{ created_at: string }>, now: Date, days: number): EvolutionPoint[] {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);

  const counts = new Map<string, number>();
  for (const item of items) {
    const createdAt = new Date(item.created_at);
    if (Number.isNaN(createdAt.getTime()) || createdAt < start || createdAt > end) continue;
    const key = dateKey(createdAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(date),
      shortLabel: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
      count: counts.get(key) || 0
    };
  });
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
