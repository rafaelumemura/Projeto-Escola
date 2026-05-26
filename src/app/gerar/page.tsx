"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarPlus, FileDown, FolderPlus, Save, Sparkles } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { activityTypes, environments, methodologies, type ActivityGenerationInput } from "@/lib/activities/types";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type WeeklyPlan = Database["public"]["Tables"]["weekly_plans"]["Row"];

const initialForm: ActivityGenerationInput = {
  age_range: "",
  methodology: "Construtivista",
  development_area: "",
  activity_type: "Sala toda",
  environment: "Sala de aula",
  materials: "",
  objective: ""
};

export default function GenerateActivityPage() {
  const { supabase } = useAuth();
  const [form, setForm] = useState<ActivityGenerationInput>(initialForm);
  const [generated, setGenerated] = useState<Partial<Activity> | null>(null);
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [planId, setPlanId] = useState("");
  const [planDate, setPlanDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections"),
      apiFetch<{ weekly_plans: WeeklyPlan[] }>(supabase, "/api/weekly-plans")
    ])
      .then(([collectionData, planData]) => {
        setCollections(collectionData.collections);
        setPlans(planData.weekly_plans);
      })
      .catch(() => undefined);
  }, [supabase]);

  function updateField<K extends keyof ActivityGenerationInput>(key: K, value: ActivityGenerationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSavedActivityId(null);

    try {
      const data = await apiFetch<{ activity: Partial<Activity> }>(supabase, "/api/activities/generate", {
        method: "POST",
        body: form
      });
      setGenerated(data.activity);
      setMessage("Atividade gerada. Revise antes de salvar ou exportar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar a atividade.");
    } finally {
      setBusy(false);
    }
  }

  async function saveIfNeeded() {
    if (!generated) throw new Error("Gere uma atividade primeiro.");
    if (savedActivityId) return savedActivityId;

    const data = await apiFetch<{ activity: Activity }>(supabase, "/api/activities", {
      method: "POST",
      body: generated
    });
    setSavedActivityId(data.activity.id);
    setGenerated(data.activity);
    return data.activity.id;
  }

  async function handleSave() {
    setBusy(true);
    setMessage(null);
    try {
      await saveIfNeeded();
      setMessage("Atividade salva com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePdf() {
    if (!generated) return;
    setBusy(true);
    setMessage(null);
    try {
      await downloadPdf(
        supabase,
        "/api/pdf/activity",
        savedActivityId ? { activity_id: savedActivityId } : { activity: generated },
        "atividade.pdf"
      );
      setMessage("PDF gerado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToCollection() {
    if (!collectionId) {
      setMessage("Escolha uma coleção.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const activityId = await saveIfNeeded();
      await apiFetch(supabase, `/api/collections/${collectionId}/activities`, {
        method: "POST",
        body: { activity_id: activityId }
      });
      setMessage("Atividade adicionada à coleção.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar à coleção.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToPlan() {
    if (!planId || !planDate) {
      setMessage("Escolha um planejamento e uma data.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const activityId = await saveIfNeeded();
      await apiFetch(supabase, `/api/weekly-plans/${planId}/items`, {
        method: "POST",
        body: {
          activity_id: activityId,
          date: planDate,
          start_time: startTime || null,
          end_time: endTime || null
        }
      });
      setMessage("Atividade adicionada ao planejamento.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar ao planejamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage
      title="Gerar atividade"
      subtitle="Preencha o contexto da turma e deixe a IA criar uma atividade pedagógica estruturada."
    >
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form onSubmit={handleGenerate} className="panel h-fit space-y-4 p-5">
          <div>
            <label className="label mb-2 block">Idade ou faixa etária</label>
            <input className="field" value={form.age_range} onChange={(event) => updateField("age_range", event.target.value)} placeholder="Ex.: 4 anos ou 6 a 7 anos" required />
          </div>

          <SelectField label="Metodologia" value={form.methodology} onChange={(value) => updateField("methodology", value as ActivityGenerationInput["methodology"])} options={methodologies} />
          <div>
            <label className="label mb-2 block">Área de desenvolvimento/conhecimento</label>
            <input className="field" value={form.development_area} onChange={(event) => updateField("development_area", event.target.value)} placeholder="Ex.: Linguagem, coordenação motora, matemática" required />
          </div>
          <SelectField label="Tipo de atividade" value={form.activity_type} onChange={(value) => updateField("activity_type", value as ActivityGenerationInput["activity_type"])} options={activityTypes} />
          <SelectField label="Ambiente" value={form.environment} onChange={(value) => updateField("environment", value as ActivityGenerationInput["environment"])} options={environments} />
          <div>
            <label className="label mb-2 block">Materiais disponíveis</label>
            <textarea className="field min-h-24" value={form.materials} onChange={(event) => updateField("materials", event.target.value)} placeholder="Papéis coloridos, cola, tesoura sem ponta..." required />
          </div>
          <div>
            <label className="label mb-2 block">Objetivo da atividade</label>
            <textarea className="field min-h-24" value={form.objective} onChange={(event) => updateField("objective", event.target.value)} placeholder="Ex.: desenvolver noção de sequência e colaboração" required />
          </div>

          <button disabled={busy} className="w-full btn-primary">
            <Sparkles size={17} />
            {busy ? "Gerando..." : "Gerar atividade"}
          </button>
        </form>

        <section className="space-y-4">
          {message ? <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

          {generated ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={handleSave} className="btn-primary">
                  <Save size={16} />
                  {savedActivityId ? "Atividade salva" : "Salvar atividade"}
                </button>
                <button disabled={busy} onClick={handlePdf} className="btn-secondary">
                  <FileDown size={16} />
                  Gerar PDF
                </button>
              </div>

              <div className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="label block">Adicionar a uma coleção</label>
                  <div className="flex gap-2">
                    <select className="field" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                      <option value="">Selecione</option>
                      {collections.map((collection) => (
                        <option key={collection.id} value={collection.id}>
                          {collection.name}
                        </option>
                      ))}
                    </select>
                    <button disabled={busy} onClick={handleAddToCollection} className="btn-secondary px-3" title="Adicionar à coleção">
                      <FolderPlus size={17} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label block">Adicionar ao planejamento semanal</label>
                  <div className="grid gap-2 sm:grid-cols-[1fr_130px_95px_95px_auto]">
                    <select className="field" value={planId} onChange={(event) => setPlanId(event.target.value)}>
                      <option value="">Planejamento</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.title}
                        </option>
                      ))}
                    </select>
                    <input className="field" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
                    <input className="field" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                    <input className="field" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                    <button disabled={busy} onClick={handleAddToPlan} className="btn-secondary px-3" title="Adicionar ao planejamento">
                      <CalendarPlus size={17} />
                    </button>
                  </div>
                </div>
              </div>

              <ActivityView activity={generated} />
            </>
          ) : (
            <div className="panel grid min-h-[520px] place-items-center p-8 text-center">
              <div>
                <Sparkles className="mx-auto text-leaf" size={36} />
                <h2 className="mt-4 text-xl font-bold">Sua atividade aparecerá aqui</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-ink/65">
                  A resposta virá com título, BNCC quando aplicável, passo a passo, dicas, variações, segurança e avaliação.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </ProtectedPage>
  );
}

function SelectField({
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
    <div>
      <label className="label mb-2 block">{label}</label>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
