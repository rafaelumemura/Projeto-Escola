"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Plus, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type MonthlyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type PlanItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function MonthlyPlanningPage() {
  const { supabase } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()));
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [pdfStartDate, setPdfStartDate] = useState(formatDate(monthStart(new Date())));
  const [pdfEndDate, setPdfEndDate] = useState(formatDate(monthEnd(new Date())));
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [activityId, setActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const monthStartDate = useMemo(() => formatDate(monthStart(currentMonth)), [currentMonth]);
  const monthEndDate = useMemo(() => formatDate(monthEnd(currentMonth)), [currentMonth]);

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, PlanItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      acc[item.date].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      return acc;
    }, {});
  }, [items]);

  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  useEffect(() => {
    apiFetch<{ activities: Activity[] }>(supabase, "/api/activities")
      .then((data) => setActivities(data.activities))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar atividades."));
  }, [supabase]);

  useEffect(() => {
    setPdfStartDate(monthStartDate);
    setPdfEndDate(monthEndDate);
    loadMonth().catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar o planejamento."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartDate, monthEndDate, supabase]);

  async function loadMonth() {
    setBusy(true);
    setMessage(null);
    try {
      const plan = await ensureMonthlyPlan();
      const details = await apiFetch<{ weekly_plan: MonthlyPlan; items: PlanItem[] }>(supabase, `/api/weekly-plans/${plan.id}`);
      setMonthlyPlan(details.weekly_plan);
      setItems(details.items || []);
    } finally {
      setBusy(false);
    }
  }

  async function ensureMonthlyPlan() {
    const title = hiddenPlanTitle(currentMonth);
    const plansData = await apiFetch<{ weekly_plans: MonthlyPlan[] }>(supabase, "/api/weekly-plans");
    const existing = plansData.weekly_plans.find((plan) => plan.title === title);

    if (existing) return existing;

    const created = await apiFetch<{ weekly_plan: MonthlyPlan }>(supabase, "/api/weekly-plans", {
      method: "POST",
      body: {
        title,
        start_date: monthStartDate,
        end_date: monthEndDate
      }
    });

    return created.weekly_plan;
  }

  function openAddModal(date: string) {
    setModalDate(date);
    setActivityId("");
    setStartTime("");
    setMessage(null);
  }

  function closeAddModal() {
    setModalDate(null);
    setActivityId("");
    setStartTime("");
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthlyPlan || !modalDate || !activityId || !startTime) {
      setMessage("Escolha uma atividade e defina o horário de início.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/weekly-plans/${monthlyPlan.id}/items`, {
        method: "POST",
        body: {
          activity_id: activityId,
          date: modalDate,
          start_time: startTime,
          end_time: null,
          notes: null
        }
      });
      closeAddModal();
      await loadMonth();
      setMessage("Atividade adicionada ao calendário.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar a atividade.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!monthlyPlan) return;

    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/weekly-plans/${monthlyPlan.id}/items/${itemId}`, { method: "DELETE" });
      await loadMonth();
      setMessage("Atividade removida do calendário.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a atividade.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePdf() {
    if (!monthlyPlan) return;
    if (!pdfStartDate || !pdfEndDate) {
      setMessage("Escolha a data de início e fim para gerar o PDF.");
      return;
    }
    if (pdfStartDate > pdfEndDate) {
      setMessage("A data de início precisa ser anterior ou igual à data final.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await downloadPdf(
        supabase,
        "/api/pdf/weekly-plan",
        {
          weekly_plan_id: monthlyPlan.id,
          start_date: pdfStartDate,
          end_date: pdfEndDate
        },
        `planejamento-mensal-${monthSlug(currentMonth)}.pdf`
      );
      setMessage("PDF gerado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage title="Planejamento mensal" subtitle="Organize as atividades salvas em um calendário mensal com horários de início.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <section className="panel mb-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="label mb-2">Gerar planejamento em PDF</p>
            <div className="grid gap-2 sm:grid-cols-[180px_180px_auto]">
              <input className="field" type="date" min={monthStartDate} max={monthEndDate} value={pdfStartDate} onChange={(event) => setPdfStartDate(event.target.value)} />
              <input className="field" type="date" min={monthStartDate} max={monthEndDate} value={pdfEndDate} onChange={(event) => setPdfEndDate(event.target.value)} />
              <button type="button" disabled={busy} onClick={generatePdf} className="btn-primary">
                <FileDown size={16} />
                Gerar PDF
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-white p-2">
            <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="btn-secondary px-3" title="Mês anterior">
              <ChevronLeft size={17} />
            </button>
            <p className="min-w-48 text-center text-sm font-bold capitalize text-ink">{monthLabel(currentMonth)}</p>
            <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-secondary px-3" title="Próximo mês">
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="panel overflow-x-auto">
        <div className="min-w-[820px] overflow-hidden rounded-lg">
          <div className="grid grid-cols-7 border-b border-ink/10 bg-paper/80">
            {weekdays.map((day) => (
              <div key={day} className="px-3 py-2 text-center text-xs font-bold uppercase text-ink/60">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dayItems = day ? groupedItems[day] || [] : [];
              return (
                <div key={day || `empty-${index}`} className="min-h-36 border-b border-r border-ink/10 bg-white p-2 [&:nth-child(7n)]:border-r-0">
                  {day ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-mint text-sm font-bold text-leaf">
                          {Number(day.slice(-2))}
                        </span>
                        <button type="button" onClick={() => openAddModal(day)} className="grid h-8 w-8 place-items-center rounded-md border border-ink/10 bg-white text-leaf transition hover:border-leaf/40 hover:bg-mint" title="Adicionar atividade">
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {dayItems.map((item) => (
                          <div key={item.id} className="rounded-md border border-leaf/15 bg-mint/60 p-2 text-xs">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="font-bold text-leaf">{formatTime(item.start_time)}</span>
                              <button type="button" disabled={busy} onClick={() => removeItem(item.id)} className="text-ink/45 hover:text-clay" title="Remover">
                                <X size={13} />
                              </button>
                            </div>
                            <p className="line-clamp-2 font-semibold text-ink">{item.activities?.title || "Atividade removida"}</p>
                            {item.activities?.bncc_code ? <p className="mt-1 font-medium text-ink/55">BNCC {item.activities.bncc_code}</p> : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {modalDate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-6">
          <form onSubmit={addItem} className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">Adicionar atividade</p>
                <h2 className="text-xl font-bold text-ink">{formatDisplayDate(modalDate)}</h2>
              </div>
              <button type="button" onClick={closeAddModal} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="label mb-2 block">Atividade</span>
                <select className="field" value={activityId} onChange={(event) => setActivityId(event.target.value)} required>
                  <option value="">Selecione uma atividade salva</option>
                  {activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="label mb-2 block">Horário de início</span>
                <input className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeAddModal} disabled={busy} className="btn-secondary">
                Cancelar
              </button>
              <button disabled={busy} className="btn-primary">
                <Plus size={16} />
                Inserir
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </ProtectedPage>
  );
}

function hiddenPlanTitle(date: Date) {
  return `Planejamento Mensal ${monthSlug(date)}`;
}

function monthSlug(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(date: Date) {
  const start = monthStart(date);
  const end = monthEnd(date);
  const days: Array<string | null> = [];

  for (let index = 0; index < start.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    days.push(formatDate(new Date(date.getFullYear(), date.getMonth(), day)));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
