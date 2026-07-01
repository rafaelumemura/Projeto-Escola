"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Plus, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { UndoToast, useUndoableAction } from "@/components/ui/UndoToast";
import {
  initialManualActivityForm,
  ManualActivityFields,
  type ManualActivityForm,
  resolveManualActivityForm
} from "@/components/ui/ManualActivityFields";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type MonthlyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ActivityWithCollections = Activity & {
  collection_ids?: string[];
  primary_collection_id?: string | null;
};
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type PlanItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const calendarMonthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const defaultColor = "#2f7d58";

export default function MonthlyPlanningPage() {
  const { supabase, profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()));
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null);
  const [activities, setActivities] = useState<ActivityWithCollections[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [items, setItems] = useState<PlanItem[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalCanChangeDate, setModalCanChangeDate] = useState(false);
  const [activityId, setActivityId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState<ManualActivityForm>(initialManualActivityForm);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfTitle, setPdfTitle] = useState("Planejamento");
  const [pdfStartDate, setPdfStartDate] = useState(formatDate(monthStart(new Date())));
  const [pdfEndDate, setPdfEndDate] = useState(formatDate(monthEnd(new Date())));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appAlert, setAppAlert] = useState<string | null>(null);
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string | null>(null);
  const { pendingAction, schedule: scheduleDeletion, undo: undoDeletion } = useUndoableAction();

  const monthStartDate = useMemo(() => formatDate(monthStart(currentMonth)), [currentMonth]);
  const monthEndDate = useMemo(() => formatDate(monthEnd(currentMonth)), [currentMonth]);
  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, PlanItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      acc[item.date].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      return acc;
    }, {});
  }, [items]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ activities: ActivityWithCollections[] }>(supabase, "/api/activities"),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      supabase.from("classes").select("*").order("created_at", { ascending: false })
    ])
      .then(([activityData, collectionData, classesResponse]) => {
        if (classesResponse.error) throw classesResponse.error;
        setActivities(activityData.activities);
        setCollections(collectionData.collections);
        setClasses(classesResponse.data || []);
        setClassesLoaded(true);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar atividades."));
  }, [supabase]);

  useEffect(() => {
    if (!classesLoaded) return;
    loadMonth().catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar o planejamento."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesLoaded, monthStartDate, monthEndDate, selectedClassId, supabase]);

  useEffect(() => {
    setMobileSelectedDate(null);
  }, [monthStartDate]);

  async function loadMonth() {
    setBusy(true);
    setMessage(null);
    try {
      if (selectedClassId === "all") {
        const plansData = await apiFetch<{ weekly_plans: MonthlyPlan[] }>(supabase, "/api/weekly-plans");
        const plans = plansData.weekly_plans.filter((plan) => {
          const planStart = plan.start_date || monthStartDate;
          const planEnd = plan.end_date || monthEndDate;
          return planStart <= monthEndDate && planEnd >= monthStartDate;
        });
        const details = await Promise.all(
          plans.map(async (plan) => ({
            plan,
            detail: await apiFetch<{ items: PlanItem[] }>(supabase, `/api/weekly-plans/${plan.id}`).catch(() => ({ items: [] }))
          }))
        );
        setMonthlyPlan(null);
        setItems(
          details
            .flatMap(({ detail }) => detail.items)
            .filter((item) => item.date >= monthStartDate && item.date <= monthEndDate)
        );
        return;
      }

      const plan = await ensureMonthlyPlan();
      const details = await apiFetch<{ weekly_plan: MonthlyPlan; items: PlanItem[] }>(supabase, `/api/weekly-plans/${plan.id}`);
      setMonthlyPlan(details.weekly_plan);
      setItems(details.items || []);
    } finally {
      setBusy(false);
    }
  }

  async function ensureMonthlyPlan() {
    return ensureMonthlyPlanForDate(currentMonth);
  }

  async function ensureMonthlyPlanForDate(date: Date) {
    if (selectedClassId === "all") {
      throw new Error("Selecione uma turma para adicionar atividades ao planejamento.");
    }
    const title = hiddenPlanTitle(date);
    const legacyTitle = legacyHiddenPlanTitle(date);
    const targetStartDate = formatDate(monthStart(date));
    const targetEndDate = formatDate(monthEnd(date));
    const plansData = await apiFetch<{ weekly_plans: MonthlyPlan[] }>(supabase, "/api/weekly-plans");
    const existing = plansData.weekly_plans.find((plan) =>
      (plan.title === title || plan.title === legacyTitle) &&
      (selectedClassId ? plan.class_id === selectedClassId : !plan.class_id)
    );

    if (existing) return existing;

    const created = await apiFetch<{ weekly_plan: MonthlyPlan }>(supabase, "/api/weekly-plans", {
      method: "POST",
      body: { title, class_id: selectedClassId || null, start_date: targetStartDate, end_date: targetEndDate }
    });

    return created.weekly_plan;
  }

  function openAddModal(date: string, canChangeDate = false) {
    if (selectedClassId === "all") {
      setMessage("Selecione uma turma para adicionar atividades ao planejamento.");
      return;
    }
    setModalDate(date);
    setModalCanChangeDate(canChangeDate);
    setActivityId("");
    setStartTime("");
    setManualMode(false);
    setManualForm(initialManualActivityForm);
    setMessage(null);
  }

  function closeAddModal() {
    setModalDate(null);
    setModalCanChangeDate(false);
    setActivityId("");
    setStartTime("");
    setManualMode(false);
    setManualForm(initialManualActivityForm);
  }

  function openPdfModal() {
    setPdfTitle("Planejamento");
    setPdfStartDate(monthStartDate);
    setPdfEndDate(monthEndDate);
    setPdfModalOpen(true);
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthlyPlan || !modalDate || !startTime) {
      setMessage("Defina a data e o horário de início.");
      return;
    }

    if (hasItemAtTime(items, modalDate, startTime)) {
      setAppAlert("Já existe uma atividade cadastrada nesse horário. Selecione outro horário");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      let resolvedActivityId = activityId;
      let notes = null;
      const selectedDate = parseDateValue(modalDate) || currentMonth;
      const targetPlan = modalCanChangeDate && !isSameMonth(selectedDate, currentMonth)
        ? await ensureMonthlyPlanForDate(selectedDate)
        : monthlyPlan;

      if (manualMode) {
        const manualPayload = resolveManualActivityForm(manualForm);

        const created = await apiFetch<{ activity: Activity }>(supabase, "/api/activities", {
          method: "POST",
          body: manualPayload.activity
        });
        resolvedActivityId = created.activity.id;
        notes = manualPayload.notes;
        setActivities((current) => [{ ...created.activity, collection_ids: [], primary_collection_id: null }, ...current]);
      }

      if (!resolvedActivityId) {
        setMessage("Escolha uma atividade ou adicione uma nova.");
        return;
      }

      await apiFetch(supabase, `/api/weekly-plans/${targetPlan.id}/items`, {
        method: "POST",
        body: {
          activity_id: resolvedActivityId,
          date: modalDate,
          start_time: startTime,
          end_time: null,
          notes
        }
      });
      closeAddModal();
      if (!isSameMonth(selectedDate, currentMonth)) {
        setCurrentMonth(monthStart(selectedDate));
      } else {
        await loadMonth();
      }
      setMessage("Atividade adicionada ao calendário.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível adicionar a atividade.";
      if (errorMessage.includes("Já existe uma atividade cadastrada nesse horário")) {
        setAppAlert("Já existe uma atividade cadastrada nesse horário. Selecione outro horário");
      } else {
        setMessage(errorMessage);
      }
    } finally {
      setBusy(false);
    }
  }

  function removeItem(item: PlanItem) {
    setMessage(null);
    const snapshot = items;
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    scheduleDeletion({
      message: "Atividade removida do planejamento.",
      commit: () => apiFetch(supabase, `/api/weekly-plans/${item.weekly_plan_id}/items/${item.id}`, { method: "DELETE" }),
      undo: () => setItems(snapshot),
      onError: (error) => setMessage(error instanceof Error ? error.message : "Não foi possível remover a atividade.")
    });
  }

  async function generatePdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthlyPlan && selectedClassId !== "all") return;
    if (!pdfStartDate || !pdfEndDate || pdfStartDate > pdfEndDate) {
      setMessage("Informe um intervalo válido para gerar o PDF.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const pdfPayload = selectedClassId === "all"
        ? {
            weekly_plan: {
              title: pdfTitle || "Planejamento",
              start_date: pdfStartDate,
              end_date: pdfEndDate
            },
            items: items.filter((item) => item.date >= pdfStartDate && item.date <= pdfEndDate),
            title: pdfTitle || "Planejamento",
            skill: profile?.planning_pdf_skill
          }
        : {
            weekly_plan_id: monthlyPlan?.id,
            start_date: pdfStartDate,
            end_date: pdfEndDate,
            title: pdfTitle || "Planejamento",
            skill: profile?.planning_pdf_skill
          };

      await downloadPdf(
        supabase,
        "/api/pdf/weekly-plan",
        pdfPayload,
        `${(pdfTitle || "planejamento").replace(/[\\/]/g, "-")}.pdf`
      );
      setPdfModalOpen(false);
      setMessage("PDF gerado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  }

  function activityColor(activity?: Activity | null) {
    if (!activity?.id) return defaultColor;
    const fullActivity = activities.find((item) => item.id === activity.id);
    const collectionId = fullActivity?.primary_collection_id || fullActivity?.collection_ids?.[0];
    return collections.find((collection) => collection.id === collectionId)?.color || defaultColor;
  }

  function openPlannedActivity(item: PlanItem) {
    if (!item.activities) return;
    setViewActivity(item.activities);
  }

  function updateManualField<K extends keyof ManualActivityForm>(key: K, value: ManualActivityForm[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedPage title="Planejamento" subtitle="Organize as atividades salvas em um calendário com horários de início.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <section className="panel mb-5 p-4">
        <label className="block max-w-md">
          <span className="label mb-2 block">Turma do planejamento</span>
          <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className="field">
            <option value="all">Todos</option>
            <option value="">Sem turma selecionada</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name}{classItem.shift ? ` - ${classItem.shift}` : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel mb-5 hidden p-4 lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label mb-1">Calendário</p>
            <h2 className="text-xl font-bold capitalize text-ink">{monthLabel(currentMonth)}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openPdfModal} className="btn-primary">
              <FileDown size={16} />
              Gerar PDF
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white p-2">
              <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="btn-secondary px-3" title="Mês anterior">
                <ChevronLeft size={17} />
              </button>
              <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn-secondary px-3" title="Próximo mês">
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="lg:hidden">
        {mobileSelectedDate ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setMobileSelectedDate(null)} className="btn-secondary rounded-full px-4">
                <ChevronLeft size={17} />
                {monthName(currentMonth)}
              </button>
              <button type="button" onClick={() => openAddModal(mobileSelectedDate)} className="grid h-11 w-11 place-items-center rounded-full border border-[#00B3AF] bg-[#00B3AF] text-white shadow-soft transition hover:bg-[#009d99]" title="Adicionar atividade">
                <Plus size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {buildWeekStrip(mobileSelectedDate).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setMobileSelectedDate(day)}
                  className={`rounded-full border px-1.5 py-2 text-center font-bold transition ${
                    day === mobileSelectedDate ? "border-leaf bg-leaf text-white" : day === formatDate(new Date()) ? "border-leaf bg-white text-leaf" : "border-transparent bg-white text-ink/65"
                  }`}
                >
                  <span className="block text-[10px] uppercase">{weekdayShort(day)}</span>
                  <span className="block text-base leading-none">{Number(day.slice(-2))}</span>
                </button>
              ))}
            </div>

            <div className="panel overflow-hidden">
              <div className="border-b border-ink/10 bg-white px-4 py-4">
                <p className="label mb-1">{weekdayLabel(mobileSelectedDate)}</p>
                <h2 className="text-xl font-bold text-ink">{formatDisplayDate(mobileSelectedDate)}</h2>
              </div>

              <div className="divide-y divide-ink/10">
                {buildTimelineHours(groupedItems[mobileSelectedDate] || []).map((hour) => {
                  const hourItems = (groupedItems[mobileSelectedDate] || []).filter((item) => itemHour(item) === hour);
                  return (
                    <div key={hour} className="grid min-h-20 grid-cols-[58px_1fr] bg-white">
                      <div className="border-r border-ink/10 px-2 py-3 text-right text-sm font-semibold text-ink/40">{pad(hour)}:00</div>
                      <div className="space-y-2 px-2 py-2">
                        {hourItems.map((item) => {
                          const color = activityColor(item.activities);
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openPlannedActivity(item)}
                              onKeyDown={(event) => {
                                if ((event.key === "Enter" || event.key === " ") && item.activities) {
                                  openPlannedActivity(item);
                                }
                              }}
                              className="grid grid-cols-[5px_1fr_auto] items-center gap-2 rounded-lg bg-paper px-2 py-2 text-sm"
                              style={{ borderColor: color }}
                            >
                              <span className="h-full min-h-10 rounded-full" style={{ backgroundColor: color }} />
                              <span className="min-w-0">
                                <span className="block truncate font-bold text-ink">{item.activities?.title || "Atividade removida"}</span>
                                <span className="block text-xs font-semibold text-ink/55">{formatTime(item.start_time)}</span>
                              </span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeItem(item);
                                }}
                                className="grid h-8 w-8 place-items-center rounded-md text-ink/35 hover:text-clay"
                                title="Remover"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel overflow-hidden p-4">
            <div className="mb-4 space-y-2">
              <div className="grid grid-cols-[1fr_104px] gap-2">
                <select
                  className="field"
                  value={currentMonth.getMonth()}
                  onChange={(event) => setCurrentMonth(new Date(currentMonth.getFullYear(), Number(event.target.value), 1))}
                  aria-label="Selecionar mês"
                >
                  {calendarMonthNames.map((month, index) => (
                    <option key={month} value={index}>
                      {month}
                    </option>
                  ))}
                </select>
                <select
                  className="field"
                  value={currentMonth.getFullYear()}
                  onChange={(event) => setCurrentMonth(new Date(Number(event.target.value), currentMonth.getMonth(), 1))}
                  aria-label="Selecionar ano"
                >
                  {mobileYearOptions(currentMonth).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={openPdfModal} className="w-full btn-primary" title="Baixar planejamento em PDF">
                <FileDown size={16} />
                Baixar planejamento - PDF
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold capitalize text-ink">{monthName(currentMonth)}</h2>
              <button
                type="button"
                onClick={() => openAddModal(formatDate(isSameMonth(new Date(), currentMonth) ? new Date() : currentMonth), true)}
                className="grid h-11 w-11 place-items-center rounded-full border border-[#00B3AF] bg-[#00B3AF] text-white shadow-soft transition hover:bg-[#009d99]"
                title="Adicionar atividade"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-ink/10 pb-2 text-center">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <span key={`${day}-${index}`} className="text-[10px] font-bold uppercase text-ink/45">
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day, index) => {
                const dayItems = day ? groupedItems[day] || [] : [];
                const isToday = day === formatDate(new Date());
                return day ? (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setMobileSelectedDate(day)}
                    className={`flex min-h-14 flex-col items-center border-b px-1 py-2 text-center transition hover:bg-paper ${isToday ? "border-2 border-leaf bg-mint/20" : "border-ink/10"}`}
                  >
                    <span className={`grid h-8 w-8 place-items-center rounded-full text-lg font-bold ${isToday ? "text-leaf" : "text-ink"}`}>
                      {Number(day.slice(-2))}
                    </span>
                    <span className="mt-auto flex h-3 max-w-full items-center justify-center gap-1 overflow-hidden">
                      {dayItems.slice(0, 3).map((item) => (
                        <span key={item.id} className="h-2 w-2 rounded-full" style={{ backgroundColor: activityColor(item.activities) }} />
                      ))}
                    </span>
                  </button>
                ) : (
                  <span key={`empty-${index}`} className="min-h-20 border-b border-ink/10" />
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="panel hidden overflow-x-auto lg:block">
        <div className="min-w-[980px] overflow-hidden rounded-lg">
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
              const isToday = day === formatDate(new Date());
              return (
                <div key={day || `empty-${index}`} className={`min-h-40 border-b border-r p-2 [&:nth-child(7n)]:border-r-0 ${isToday ? "border-leaf bg-mint/20 ring-2 ring-inset ring-leaf" : "border-ink/10 bg-white"}`}>
                  {day ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-lg font-bold text-ink/60">{Number(day.slice(-2))}</span>
                        <button type="button" onClick={() => openAddModal(day)} className="grid h-8 w-8 place-items-center rounded-md border border-ink/10 bg-white text-leaf transition hover:border-leaf/40 hover:bg-mint" title="Adicionar atividade">
                          <Plus size={16} />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {dayItems.map((item) => {
                          const color = activityColor(item.activities);
                          return (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openPlannedActivity(item)}
                              onKeyDown={(event) => {
                                if ((event.key === "Enter" || event.key === " ") && item.activities) {
                                  openPlannedActivity(item);
                                }
                              }}
                              className="grid w-full grid-cols-[5px_1fr_auto_auto] items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition hover:bg-paper"
                            >
                              <span className="h-5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="truncate font-semibold text-ink">{item.activities?.title || "Atividade removida"}</span>
                              <span className="font-semibold text-ink/55">{formatTime(item.start_time)}</span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeItem(item);
                                }}
                                className="text-ink/35 hover:text-clay"
                                title="Remover"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          );
                        })}
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
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6">
          <form onSubmit={addItem} className="w-full max-w-2xl rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">Adicionar atividade</p>
                <h2 className="text-xl font-bold text-ink">{modalCanChangeDate ? "Escolha a data e a atividade" : formatDisplayDate(modalDate)}</h2>
              </div>
              <button type="button" onClick={closeAddModal} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4">
              {modalCanChangeDate ? (
                <CalendarDateField label="Data" value={modalDate} onChange={setModalDate} />
              ) : null}

              <label className="block">
                <span className="label mb-2 block">Horário de início</span>
                <input className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
              </label>

              {!manualMode ? (
                <label className="block">
                  <span className="label mb-2 block">Atividade</span>
                  <select className="field" value={activityId} onChange={(event) => setActivityId(event.target.value)} required={!manualMode}>
                    <option value="">Selecione uma atividade salva</option>
                    {activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setManualMode((current) => !current);
                  setActivityId("");
                  setManualForm(initialManualActivityForm);
                }}
                className="btn-secondary"
              >
                <Plus size={16} />
                {manualMode ? "Usar atividade salva" : "Adicionar nova atividade"}
              </button>

              {manualMode ? <ManualActivityFields form={manualForm} onChange={updateManualField} /> : null}
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

      {pdfModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6">
          <form onSubmit={generatePdf} className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="relative mb-5 text-center">
              <div>
                <p className="label mb-2">Gerar PDF</p>
                <h2 className="text-xl font-bold text-ink">Planejamento</h2>
              </div>
              <button type="button" onClick={() => setPdfModalOpen(false)} className="absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="label mb-2 block">Título</span>
                <input className="field" value={pdfTitle} onChange={(event) => setPdfTitle(event.target.value)} placeholder="Ex.: Semana da Natureza" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <CalendarDateField label="Data inicial" value={pdfStartDate} onChange={setPdfStartDate} />
                <CalendarDateField label="Data final" value={pdfEndDate} onChange={setPdfEndDate} align="right" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPdfModalOpen(false)} disabled={busy} className="btn-secondary">
                Cancelar
              </button>
              <button disabled={busy} className="btn-primary">
                <FileDown size={16} />
                Gerar PDF
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {viewActivity ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 px-4 py-6">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setViewActivity(null)}
                className="grid h-10 w-10 place-items-center rounded-md border border-ink/10 bg-white text-ink/60 shadow-soft hover:text-ink"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <ActivityView activity={viewActivity} />
          </div>
        </div>
      ) : null}

      {appAlert ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/45 px-4 py-6">
          <div className="w-full max-w-sm rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <p className="label mb-2">Atenção</p>
            <h2 className="text-lg font-bold text-ink">Horário indisponível</h2>
            <p className="mt-3 text-sm leading-6 text-ink/70">{appAlert}</p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setAppAlert(null)} className="btn-primary">
                Entendi
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <UndoToast action={pendingAction} onUndo={undoDeletion} />
    </ProtectedPage>
  );
}

function CalendarDateField({
  label,
  value,
  onChange,
  align = "left"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align?: "left" | "right";
}) {
  const currentYear = new Date().getFullYear();
  const parts = parseDateParts(value) || {
    year: currentYear,
    month: new Date().getMonth() + 1,
    day: new Date().getDate()
  };
  const selectedDate = new Date(parts.year, parts.month - 1, parts.day);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => monthStart(selectedDate));
  const years = Array.from({ length: 15 }, (_, index) => viewDate.getFullYear() - 7 + index);
  const viewDays = buildCalendarDays(viewDate);
  const selectedValue = formatDate(selectedDate);
  const todayValue = formatDate(new Date());

  useEffect(() => {
    const nextParts = parseDateParts(selectedValue);
    if (!open && nextParts) {
      setViewDate(monthStart(new Date(nextParts.year, nextParts.month - 1, nextParts.day)));
    }
  }, [open, selectedValue]);

  function selectDate(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  function updateMonth(monthIndex: number) {
    setViewDate(new Date(viewDate.getFullYear(), monthIndex, 1));
  }

  function updateYear(year: number) {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
  }

  return (
    <div className="relative block">
      <span className="label mb-2 block">{label}</span>
      <button type="button" onClick={() => setOpen((current) => !current)} className="field flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span>{formatDatePickerValue(value)}</span>
        <ChevronRight size={16} className={`text-ink/45 transition ${open ? "rotate-90" : ""}`} />
      </button>

      {open ? (
        <div className={`absolute top-full z-[70] mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-lg border border-ink/10 bg-white p-3 shadow-soft ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" onClick={() => setViewDate(addMonths(viewDate, -1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-ink/10 text-ink/65 hover:border-leaf/40 hover:text-leaf" title="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <select className="field h-9 px-2 py-0 text-sm" value={viewDate.getMonth()} onChange={(event) => updateMonth(Number(event.target.value))} aria-label={`${label}: mês`}>
              {calendarMonthNames.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
            <select className="field h-9 w-24 px-2 py-0 text-sm" value={viewDate.getFullYear()} onChange={(event) => updateYear(Number(event.target.value))} aria-label={`${label}: ano`}>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-ink/10 text-ink/65 hover:border-leaf/40 hover:text-leaf" title="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => (
              <span key={day} className="py-1 text-[0.68rem] font-bold uppercase text-ink/45">
                {day}
              </span>
            ))}
            {viewDays.map((day, index) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  className={`grid h-9 place-items-center rounded-md text-sm font-bold transition ${
                    day === selectedValue
                      ? "bg-leaf text-white"
                      : day === todayValue
                        ? "bg-mint text-leaf hover:bg-leaf hover:text-white"
                        : "text-ink/75 hover:bg-mint hover:text-leaf"
                  }`}
                >
                  {Number(day.slice(8, 10))}
                </button>
              ) : (
                <span key={`empty-${index}`} className="h-9" />
              )
            )}
          </div>

          <div className="mt-3 flex justify-between gap-2 border-t border-ink/10 pt-3">
            <button type="button" onClick={() => selectDate(formatDate(new Date()))} className="text-sm font-bold text-leaf underline underline-offset-4">
              Hoje
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-ink/55 hover:text-ink">
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function parseDateValue(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

function hiddenPlanTitle(date: Date) {
  return `Planejamento ${monthSlug(date)}`;
}

function legacyHiddenPlanTitle(date: Date) {
  return ["Planejamento", "Mensal", monthSlug(date)].join(" ");
}

function monthSlug(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function monthName(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(date);
}

function mobileYearOptions(date: Date) {
  return Array.from({ length: 15 }, (_, index) => date.getFullYear() - 7 + index);
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

function formatDatePickerValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Selecionar data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function weekdayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(year, month - 1, day));
}

function weekdayShort(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(year, month - 1, day)).replace(".", "");
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

function buildWeekStrip(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  const start = new Date(selected);
  start.setDate(selected.getDate() - selected.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDate(date);
  });
}

function buildTimelineHours(_items: PlanItem[]) {
  return Array.from({ length: 13 }, (_, index) => 7 + index);
}

function itemHour(item: PlanItem) {
  const hour = Number((item.start_time || "").slice(0, 2));
  return Number.isFinite(hour) ? hour : -1;
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function hasItemAtTime(items: PlanItem[], date: string, startTime: string) {
  const normalizedTime = formatTime(startTime);
  return items.some((item) => item.date === date && formatTime(item.start_time) === normalizedTime);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
