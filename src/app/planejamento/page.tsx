"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Plus, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { environments, methodologies } from "@/lib/activities/types";
import type { Database } from "@/lib/database.types";

type MonthlyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ActivityWithCollections = Activity & {
  collection_ids?: string[];
  primary_collection_id?: string | null;
};
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type PlanItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const defaultColor = "#2f7d58";
const manualActivityTypes = ["Individual", "Dupla", "Trio", "Sala Toda"] as const;

type ManualActivityForm = {
  title: string;
  bncc_code: string;
  age_range: string;
  estimated_time: string;
  methodology: string;
  custom_methodology: string;
  development_area: string;
  activity_type: string;
  environment: string;
  custom_environment: string;
  materials: string;
  objective: string;
  steps_text: string;
  safety_notes: string;
  notes: string;
};

const initialManualActivityForm: ManualActivityForm = {
  title: "",
  bncc_code: "",
  age_range: "",
  estimated_time: "",
  methodology: "Construtivista",
  custom_methodology: "",
  development_area: "",
  activity_type: "Sala Toda",
  environment: "Sala de aula",
  custom_environment: "",
  materials: "",
  objective: "",
  steps_text: "",
  safety_notes: "",
  notes: ""
};

export default function MonthlyPlanningPage() {
  const { supabase, profile } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()));
  const [monthlyPlan, setMonthlyPlan] = useState<MonthlyPlan | null>(null);
  const [activities, setActivities] = useState<ActivityWithCollections[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
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
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections")
    ])
      .then(([activityData, collectionData]) => {
        setActivities(activityData.activities);
        setCollections(collectionData.collections);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar atividades."));
  }, [supabase]);

  useEffect(() => {
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
    const legacyTitle = legacyHiddenPlanTitle(currentMonth);
    const plansData = await apiFetch<{ weekly_plans: MonthlyPlan[] }>(supabase, "/api/weekly-plans");
    const existing = plansData.weekly_plans.find((plan) => plan.title === title || plan.title === legacyTitle);

    if (existing) return existing;

    const created = await apiFetch<{ weekly_plan: MonthlyPlan }>(supabase, "/api/weekly-plans", {
      method: "POST",
      body: { title, start_date: monthStartDate, end_date: monthEndDate }
    });

    return created.weekly_plan;
  }

  function openAddModal(date: string) {
    setModalDate(date);
    setActivityId("");
    setStartTime("");
    setManualMode(false);
    setManualForm(initialManualActivityForm);
    setMessage(null);
  }

  function closeAddModal() {
    setModalDate(null);
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
      window.alert("Já existe uma atividade cadastrada nesse horário. Selecione outro horário");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      let resolvedActivityId = activityId;
      let notes = null;

      if (manualMode) {
        const methodology = manualForm.methodology === "Outra" ? manualForm.custom_methodology.trim() : manualForm.methodology;
        const environment = manualForm.environment === "Outro" ? manualForm.custom_environment.trim() : manualForm.environment;
        const steps = textArray(manualForm.steps_text);

        if (
          !manualForm.title.trim() ||
          !manualForm.age_range.trim() ||
          !manualForm.estimated_time.trim() ||
          !methodology ||
          !manualForm.development_area.trim() ||
          !manualForm.activity_type ||
          !environment ||
          !manualForm.materials.trim() ||
          !manualForm.objective.trim() ||
          !steps.length ||
          !manualForm.safety_notes.trim()
        ) {
          setMessage("Preencha os campos da nova atividade antes de inserir.");
          return;
        }

        const created = await apiFetch<{ activity: Activity }>(supabase, "/api/activities", {
          method: "POST",
          body: {
            title: manualForm.title.trim(),
            age_range: manualForm.age_range.trim(),
            estimated_time: manualForm.estimated_time.trim(),
            methodology,
            development_area: manualForm.development_area.trim(),
            activity_type: manualForm.activity_type,
            environment,
            materials: manualForm.materials.trim(),
            objective: manualForm.objective.trim(),
            bncc_code: manualForm.bncc_code.trim() || null,
            description: null,
            steps,
            teacher_tips: [],
            variations: [],
            safety_notes: manualForm.safety_notes.trim(),
            evaluation: null,
            raw_ai_response: { manual: true }
          }
        });
        resolvedActivityId = created.activity.id;
        notes = manualForm.notes.trim() || null;
        setActivities((current) => [{ ...created.activity, collection_ids: [], primary_collection_id: null }, ...current]);
      }

      if (!resolvedActivityId) {
        setMessage("Escolha uma atividade ou adicione uma nova.");
        return;
      }

      await apiFetch(supabase, `/api/weekly-plans/${monthlyPlan.id}/items`, {
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

  async function generatePdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!monthlyPlan) return;
    if (!pdfStartDate || !pdfEndDate || pdfStartDate > pdfEndDate) {
      setMessage("Informe um intervalo válido para gerar o PDF.");
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
          end_date: pdfEndDate,
          title: pdfTitle || "Planejamento",
          skill: profile?.planning_pdf_skill
        },
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

  function updateManualField<K extends keyof ManualActivityForm>(key: K, value: ManualActivityForm[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <ProtectedPage title="Planejamento" subtitle="Organize as atividades salvas em um calendário com horários de início.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <section className="panel mb-5 p-4">
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

      <section className="space-y-3 lg:hidden">
        {calendarDays.filter((day): day is string => Boolean(day)).map((day) => {
          const dayItems = groupedItems[day] || [];
          return (
            <div key={day} className="rounded-lg border border-ink/10 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="label mb-1">{weekdayLabel(day)}</p>
                  <h3 className="text-lg font-bold text-ink">{formatDisplayDate(day)}</h3>
                </div>
                <button type="button" onClick={() => openAddModal(day)} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 bg-white text-leaf transition hover:border-leaf/40 hover:bg-mint" title="Adicionar atividade">
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-2">
                {dayItems.map((item) => {
                  const color = activityColor(item.activities);
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => item.activities && setViewActivity(item.activities)}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && item.activities) {
                          setViewActivity(item.activities);
                        }
                      }}
                      className="grid grid-cols-[5px_1fr_auto_auto] items-center gap-2 rounded-md bg-paper/70 px-2 py-2 text-sm"
                    >
                      <span className="h-6 rounded-full" style={{ backgroundColor: color }} />
                      <span className="min-w-0 truncate font-semibold text-ink">{item.activities?.title || "Atividade removida"}</span>
                      <span className="font-semibold text-ink/55">{formatTime(item.start_time)}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeItem(item.id);
                        }}
                        className="text-ink/35 hover:text-clay"
                        title="Remover"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}

                {!dayItems.length ? <p className="rounded-md border border-dashed border-ink/15 p-3 text-sm font-semibold text-ink/50">Sem atividades.</p> : null}
              </div>
            </div>
          );
        })}
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
              return (
                <div key={day || `empty-${index}`} className="min-h-40 border-b border-r border-ink/10 bg-white p-2 [&:nth-child(7n)]:border-r-0">
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
                              onClick={() => item.activities && setViewActivity(item.activities)}
                              onKeyDown={(event) => {
                                if ((event.key === "Enter" || event.key === " ") && item.activities) {
                                  setViewActivity(item.activities);
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
                                  removeItem(item.id);
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
                <h2 className="text-xl font-bold text-ink">{formatDisplayDate(modalDate)}</h2>
              </div>
              <button type="button" onClick={closeAddModal} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4">
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

              {manualMode ? (
                <div className="space-y-4 rounded-lg border border-ink/10 bg-paper/60 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <ManualInput label="Nome da Atividade" value={manualForm.title} onChange={(value) => updateManualField("title", value)} required />
                    <ManualInput label="Código BNCC" value={manualForm.bncc_code} onChange={(value) => updateManualField("bncc_code", value)} />
                    <ManualInput label="Idade ou Faixa Etária" value={manualForm.age_range} onChange={(value) => updateManualField("age_range", value)} required />
                    <ManualInput label="Tempo de duração" value={manualForm.estimated_time} onChange={(value) => updateManualField("estimated_time", value)} required />
                    <ManualSelect label="Metodologia" value={manualForm.methodology} options={methodologies} onChange={(value) => updateManualField("methodology", value)} />
                    {manualForm.methodology === "Outra" ? (
                      <ManualInput label="Qual metodologia?" value={manualForm.custom_methodology} onChange={(value) => updateManualField("custom_methodology", value)} required />
                    ) : null}
                    <ManualInput label="Área de Desenvolvimento" value={manualForm.development_area} onChange={(value) => updateManualField("development_area", value)} required />
                    <ManualSelect label="Tipo de Atividade" value={manualForm.activity_type} options={manualActivityTypes} onChange={(value) => updateManualField("activity_type", value)} />
                    <ManualSelect label="Ambiente" value={manualForm.environment} options={environments} onChange={(value) => updateManualField("environment", value)} />
                    {manualForm.environment === "Outro" ? (
                      <ManualInput label="Qual ambiente?" value={manualForm.custom_environment} onChange={(value) => updateManualField("custom_environment", value)} required />
                    ) : null}
                  </div>
                  <ManualArea label="Materiais Disponíveis" value={manualForm.materials} onChange={(value) => updateManualField("materials", value)} required />
                  <ManualArea label="Objetivo da Atividade" value={manualForm.objective} onChange={(value) => updateManualField("objective", value)} required />
                  <ManualArea label="Passo a passo" value={manualForm.steps_text} onChange={(value) => updateManualField("steps_text", value)} placeholder="Uma etapa por linha" required />
                  <ManualArea label="Observações de segurança" value={manualForm.safety_notes} onChange={(value) => updateManualField("safety_notes", value)} required />
                  <ManualArea label="Anotações" value={manualForm.notes} onChange={(value) => updateManualField("notes", value)} placeholder="Espaço livre para observações do professor" />
                </div>
              ) : null}
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
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">Gerar PDF</p>
                <h2 className="text-xl font-bold text-ink">Planejamento</h2>
              </div>
              <button type="button" onClick={() => setPdfModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="label mb-2 block">Título</span>
                <input className="field" value={pdfTitle} onChange={(event) => setPdfTitle(event.target.value)} placeholder="Ex.: Semana da Natureza" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="label mb-2 block">Data inicial</span>
                  <input className="field" type="date" min={monthStartDate} max={monthEndDate} value={pdfStartDate} onChange={(event) => setPdfStartDate(event.target.value)} required />
                </label>
                <label className="block">
                  <span className="label mb-2 block">Data final</span>
                  <input className="field" type="date" min={monthStartDate} max={monthEndDate} value={pdfEndDate} onChange={(event) => setPdfEndDate(event.target.value)} required />
                </label>
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
            <div className="mb-3 flex justify-end">
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
    </ProtectedPage>
  );
}

function ManualInput({
  label,
  value,
  onChange,
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function ManualSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)} required>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ManualArea({
  label,
  value,
  onChange,
  placeholder,
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <textarea className="field min-h-24" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function textArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function weekdayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(year, month - 1, day));
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

function hasItemAtTime(items: PlanItem[], date: string, startTime: string) {
  const normalizedTime = formatTime(startTime);
  return items.some((item) => item.date === date && formatTime(item.start_time) === normalizedTime);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
