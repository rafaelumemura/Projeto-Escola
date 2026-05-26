"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileDown, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];
type WeeklyPlanItem = Database["public"]["Tables"]["weekly_plan_items"]["Row"] & {
  activities?: Activity | null;
};
type Activity = Database["public"]["Tables"]["activities"]["Row"];

export default function WeeklyPlansPage() {
  const { supabase } = useAuth();
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<WeeklyPlan | null>(null);
  const [items, setItems] = useState<WeeklyPlanItem[]>([]);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [activityId, setActivityId] = useState("");
  const [itemDate, setItemDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, WeeklyPlanItem[]>>((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [items]);

  async function loadPlans() {
    const data = await apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans");
    setPlans(data.weekly_plans);
    setSelected((current) => current || data.weekly_plans[0] || null);
  }

  async function loadPlanDetails(planId: string) {
    const data = await apiFetch<{ weekly_plan: WeeklyPlan; items: WeeklyPlanItem[] }>(supabase, `/api/weekly-plans/${planId}`);
    setSelected(data.weekly_plan);
    setItems(data.items || []);
    setEditTitle(data.weekly_plan.title);
    setEditStartDate(data.weekly_plan.start_date || "");
    setEditEndDate(data.weekly_plan.end_date || "");
  }

  useEffect(() => {
    Promise.all([
      loadPlans(),
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities")
    ])
      .then(([, activityData]) => setActivities(activityData.activities))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar planejamentos."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (selected?.id) {
      loadPlanDetails(selected.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ weekly_plan: WeeklyPlan }>(supabase, "/api/weekly-plans", {
        method: "POST",
        body: {
          title,
          start_date: startDate || null,
          end_date: endDate || null
        }
      });
      setTitle("");
      setStartDate("");
      setEndDate("");
      setSelected(data.weekly_plan);
      await loadPlans();
      setMessage("Planejamento criado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ weekly_plan: WeeklyPlan }>(supabase, `/api/weekly-plans/${selected.id}`, {
        method: "PUT",
        body: {
          title: editTitle,
          start_date: editStartDate || null,
          end_date: editEndDate || null
        }
      });
      setSelected(data.weekly_plan);
      await loadPlans();
      setMessage("Planejamento atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePlan() {
    if (!selected || !window.confirm("Excluir este planejamento?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/weekly-plans/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      setItems([]);
      await loadPlans();
      setMessage("Planejamento excluído.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!selected || !activityId || !itemDate) return setMessage("Escolha atividade e data.");
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/weekly-plans/${selected.id}/items`, {
        method: "POST",
        body: {
          activity_id: activityId,
          date: itemDate,
          start_time: startTime || null,
          end_time: endTime || null,
          notes: notes || null
        }
      });
      setActivityId("");
      setItemDate("");
      setStartTime("");
      setEndTime("");
      setNotes("");
      await loadPlanDetails(selected.id);
      setMessage("Atividade adicionada ao planejamento.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/weekly-plans/${selected.id}/items/${itemId}`, { method: "DELETE" });
      await loadPlanDetails(selected.id);
      setMessage("Item removido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage title="Planejamento semanal" subtitle="Monte uma agenda semanal com atividades salvas, datas e horários.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <form onSubmit={createPlan} className="panel space-y-3 p-4">
            <div className="flex items-center gap-2 font-bold">
              <CalendarDays size={18} className="text-leaf" />
              Novo planejamento
            </div>
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Semana 1 - Natureza" required />
            <div className="grid grid-cols-2 gap-2">
              <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              <input className="field" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
            <button disabled={busy} className="w-full btn-primary">
              <Plus size={16} />
              Criar planejamento
            </button>
          </form>

          <div className="space-y-2">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelected(plan)}
                className={`w-full rounded-lg border bg-white p-4 text-left transition ${
                  selected?.id === plan.id ? "border-leaf ring-2 ring-leaf/15" : "border-ink/10 hover:border-leaf/40"
                }`}
              >
                <h2 className="font-bold">{plan.title}</h2>
                <p className="mt-1 text-sm text-ink/60">{plan.start_date || "Início"} até {plan.end_date || "fim"}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          {selected ? (
            <>
              <form onSubmit={updatePlan} className="panel space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold">
                    <Pencil size={18} className="text-leaf" />
                    Editar planejamento
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => downloadPdf(supabase, "/api/pdf/weekly-plan", { weekly_plan_id: selected.id }, "planejamento-semanal.pdf")}
                      className="btn-secondary"
                    >
                      <FileDown size={16} />
                      PDF
                    </button>
                    <button type="button" disabled={busy} onClick={deletePlan} className="btn-danger">
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
                <input className="field" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="field" type="date" value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} />
                  <input className="field" type="date" value={editEndDate} onChange={(event) => setEditEndDate(event.target.value)} />
                </div>
                <button disabled={busy} className="btn-primary">
                  <Save size={16} />
                  Salvar planejamento
                </button>
              </form>

              <div className="panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">Adicionar atividade</h2>
                  <span className="badge">{items.length} itens</span>
                </div>

                <div className="grid gap-2 lg:grid-cols-[1fr_140px_100px_100px]">
                  <select className="field" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
                    <option value="">Atividade salva</option>
                    {activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                  <input className="field" type="date" value={itemDate} onChange={(event) => setItemDate(event.target.value)} />
                  <input className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                  <input className="field" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="field" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas opcionais" />
                  <button disabled={busy} onClick={addItem} className="btn-primary">
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(groupedItems).map(([date, dayItems]) => (
                  <div key={date} className="panel p-5">
                    <h2 className="mb-3 text-lg font-bold">{date}</h2>
                    <div className="space-y-3">
                      {dayItems.map((item) => (
                        <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-white p-4">
                          <div>
                            <p className="text-xs font-bold uppercase text-leaf">
                              {[item.start_time, item.end_time].filter(Boolean).join(" - ") || "Sem horário"}
                            </p>
                            <h3 className="mt-1 font-bold">{item.activities?.title || "Atividade removida"}</h3>
                            {item.notes ? <p className="mt-1 text-sm text-ink/60">{item.notes}</p> : null}
                          </div>
                          <button disabled={busy} onClick={() => removeItem(item.id)} className="btn-secondary px-3" title="Remover item">
                            <X size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {!items.length ? (
                  <div className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-sm font-semibold text-ink/60">
                    Nenhuma atividade no planejamento.
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="panel p-8 text-center text-sm font-semibold text-ink/60">Selecione ou crie um planejamento.</div>
          )}
        </section>
      </div>
    </ProtectedPage>
  );
}
