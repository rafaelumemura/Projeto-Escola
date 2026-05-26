"use client";

import { FormEvent, useState } from "react";
import { FileDown, Sparkles, Trash2 } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { activityTypes, environments, methodologies, type ActivityGenerationInput } from "@/lib/activities/types";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];

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
  const [customMethodology, setCustomMethodology] = useState("");
  const [customEnvironment, setCustomEnvironment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateField<K extends keyof ActivityGenerationInput>(key: K, value: ActivityGenerationInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      ...form,
      methodology: form.methodology === "Outra" ? customMethodology.trim() : form.methodology,
      environment: form.environment === "Outro" ? customEnvironment.trim() : form.environment
    };

    if (!payload.methodology || !payload.environment) {
      setMessage("Preencha o campo personalizado antes de gerar a atividade.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setSavedActivityId(null);

    try {
      const data = await apiFetch<{ activity: Partial<Activity> }>(supabase, "/api/activities/generate", {
        method: "POST",
        body: payload
      });
      const saved = await apiFetch<{ activity: Activity }>(supabase, "/api/activities", {
        method: "POST",
        body: data.activity
      });
      setGenerated(saved.activity);
      setSavedActivityId(saved.activity.id);
      setMessage("Atividade gerada e salva automaticamente em Atividades.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar a atividade.");
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
        pdfFileName(generated.title || "atividade")
      );
      setMessage("PDF gerado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar PDF.");
    } finally {
      setBusy(false);
    }
  }

  function discardGenerated() {
    setGenerated(null);
    setSavedActivityId(null);
    setMessage("Tela limpa.");
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

          <SelectField label="Metodologia" value={form.methodology} onChange={(value) => updateField("methodology", value)} options={methodologies} />
          {form.methodology === "Outra" ? (
            <div>
              <label className="label mb-2 block">Qual metodologia?</label>
              <input className="field" value={customMethodology} onChange={(event) => setCustomMethodology(event.target.value)} placeholder="Digite a metodologia" required />
            </div>
          ) : null}
          <div>
            <label className="label mb-2 block">Área de desenvolvimento/conhecimento</label>
            <input className="field" value={form.development_area} onChange={(event) => updateField("development_area", event.target.value)} placeholder="Ex.: Linguagem, coordenação motora, matemática" required />
          </div>
          <SelectField label="Tipo de atividade" value={form.activity_type} onChange={(value) => updateField("activity_type", value as ActivityGenerationInput["activity_type"])} options={activityTypes} />
          <SelectField label="Ambiente" value={form.environment} onChange={(value) => updateField("environment", value)} options={environments} />
          {form.environment === "Outro" ? (
            <div>
              <label className="label mb-2 block">Qual ambiente?</label>
              <input className="field" value={customEnvironment} onChange={(event) => setCustomEnvironment(event.target.value)} placeholder="Digite o ambiente" required />
            </div>
          ) : null}
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
                <button disabled={busy} onClick={handlePdf} className="btn-secondary">
                  <FileDown size={16} />
                  Gerar PDF
                </button>
                <button disabled={busy} onClick={discardGenerated} className="btn-secondary">
                  <Trash2 size={16} />
                  Limpar tela
                </button>
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

function pdfFileName(title: string) {
  const safeTitle = title.replace(/[\\/]/g, "-").trim() || "atividade";
  return `${safeTitle}.pdf`;
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
