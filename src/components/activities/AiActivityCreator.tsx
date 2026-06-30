"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, FileDown, Sparkles, Trash2 } from "lucide-react";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { activityTypes, environments, methodologies, type ActivityGenerationInput } from "@/lib/activities/types";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];

const generationEnvironments = environments.filter((item) => item !== "Casa");
const initialForm: ActivityGenerationInput = {
  age_range: "",
  methodology: "Construtivista",
  development_area: "",
  activity_type: "Sala toda",
  environment: "Sala de aula",
  materials: "",
  objective: ""
};

export function AiActivityCreator({
  onBack,
  onActivityCreated
}: {
  onBack: () => void;
  onActivityCreated?: (activity: Activity) => void;
}) {
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
      const data = await apiFetch<{ activity: Activity }>(supabase, "/api/activities/generate", {
        method: "POST",
        body: payload
      });
      setGenerated(data.activity);
      setSavedActivityId(data.activity.id);
      onActivityCreated?.(data.activity);
      window.dispatchEvent(new Event("billing-usage-changed"));
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
    setMessage("Tela limpa.");
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-leaf hover:underline hover:underline-offset-4">
        <ArrowLeft size={17} />
        Voltar para atividades
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        <form onSubmit={handleGenerate} className="panel h-fit p-5">
          <FormSection title="Contexto da turma">
            <TextField
              label="Idade ou faixa etária"
              value={form.age_range}
              onChange={(value) => updateField("age_range", value)}
              placeholder="Ex.: 4 anos ou 6 a 7 anos"
            />
          </FormSection>

          <FormSection title="O que será trabalhado">
            <TextField
              label="Área de desenvolvimento/conhecimento"
              value={form.development_area}
              onChange={(value) => updateField("development_area", value)}
              placeholder="Ex.: Linguagem, coordenação motora, matemática"
            />
            <TextAreaField
              label="Objetivo da atividade"
              value={form.objective}
              onChange={(value) => updateField("objective", value)}
              placeholder="Ex.: desenvolver noção de sequência e colaboração"
            />
          </FormSection>

          <FormSection title="Como a atividade será aplicada">
            <SelectField label="Tipo de atividade" value={form.activity_type} onChange={(value) => updateField("activity_type", value as ActivityGenerationInput["activity_type"])} options={activityTypes} />
            <SelectField label="Ambiente" value={form.environment} onChange={(value) => updateField("environment", value)} options={generationEnvironments} />
            {form.environment === "Outro" ? (
              <TextField label="Qual ambiente?" value={customEnvironment} onChange={setCustomEnvironment} placeholder="Digite o ambiente" />
            ) : null}
            <SelectField label="Metodologia" value={form.methodology} onChange={(value) => updateField("methodology", value)} options={methodologies} />
            {form.methodology === "Outra" ? (
              <TextField label="Qual metodologia?" value={customMethodology} onChange={setCustomMethodology} placeholder="Digite a metodologia" />
            ) : null}
          </FormSection>

          <FormSection title="Recursos disponíveis" last>
            <TextAreaField
              label="Materiais disponíveis"
              value={form.materials}
              onChange={(value) => updateField("materials", value)}
              placeholder="Papéis coloridos, cola, tesoura sem ponta..."
            />
          </FormSection>

          <button disabled={busy} className="mt-5 w-full btn-primary">
            <Sparkles size={17} />
            {busy ? "Gerando..." : "Gerar atividade"}
          </button>
        </form>

        <section className="space-y-4">
          {message ? <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

          {generated ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={handlePdf} className="btn-secondary">
                  <FileDown size={16} />
                  Gerar PDF
                </button>
                <button type="button" disabled={busy} onClick={discardGenerated} className="btn-secondary">
                  <Trash2 size={16} />
                  Limpar tela
                </button>
                <button type="button" onClick={onBack} className="btn-primary">
                  <ArrowLeft size={16} />
                  Ver em Atividades
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
    </div>
  );
}

function FormSection({ title, children, last = false }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <fieldset className={`space-y-4 py-5 first:pt-0 ${last ? "" : "border-b border-ink/10"}`}>
      <legend className="label mb-4 block w-full text-leaf">{title}</legend>
      {children}
    </fieldset>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required />
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <textarea className="field min-h-24" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function pdfFileName(title: string) {
  const safeTitle = title.replace(/[\\/]/g, "-").trim() || "atividade";
  return `${safeTitle}.pdf`;
}
