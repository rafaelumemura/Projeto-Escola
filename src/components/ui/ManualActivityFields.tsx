"use client";

import { environments, methodologies } from "@/lib/activities/types";

export type ManualActivityForm = {
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

export const manualActivityTypes = ["Individual", "Dupla", "Trio", "Sala Toda"] as const;

export const initialManualActivityForm: ManualActivityForm = {
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

export function resolveManualActivityForm(form: ManualActivityForm) {
  const methodology = form.methodology === "Outra" ? form.custom_methodology.trim() : form.methodology;
  const environment = form.environment === "Outro" ? form.custom_environment.trim() : form.environment;
  const steps = textArray(form.steps_text);

  if (
    !form.title.trim() ||
    !form.age_range.trim() ||
    !form.estimated_time.trim() ||
    !methodology ||
    !form.development_area.trim() ||
    !form.activity_type ||
    !environment ||
    !form.materials.trim() ||
    !form.objective.trim() ||
    !steps.length ||
    !form.safety_notes.trim()
  ) {
    throw new Error("Preencha os campos da nova atividade antes de salvar.");
  }

  return {
    activity: {
      title: form.title.trim(),
      age_range: form.age_range.trim(),
      estimated_time: form.estimated_time.trim(),
      methodology,
      development_area: form.development_area.trim(),
      activity_type: form.activity_type,
      environment,
      materials: form.materials.trim(),
      objective: form.objective.trim(),
      bncc_code: form.bncc_code.trim() || null,
      description: null,
      steps,
      teacher_tips: [],
      variations: [],
      safety_notes: form.safety_notes.trim(),
      evaluation: null,
      raw_ai_response: { manual: true }
    },
    notes: form.notes.trim() || null
  };
}

export function ManualActivityFields({
  form,
  onChange
}: {
  form: ManualActivityForm;
  onChange: <K extends keyof ManualActivityForm>(key: K, value: ManualActivityForm[K]) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-ink/10 bg-paper/60 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <ManualInput label="Nome da Atividade" value={form.title} onChange={(value) => onChange("title", value)} required />
        <ManualInput label="Código BNCC" value={form.bncc_code} onChange={(value) => onChange("bncc_code", value)} />
        <ManualInput label="Idade ou Faixa Etária" value={form.age_range} onChange={(value) => onChange("age_range", value)} required />
        <ManualInput label="Tempo de duração" value={form.estimated_time} onChange={(value) => onChange("estimated_time", value)} required />
        <ManualSelect label="Metodologia" value={form.methodology} options={methodologies} onChange={(value) => onChange("methodology", value)} />
        {form.methodology === "Outra" ? (
          <ManualInput label="Qual metodologia?" value={form.custom_methodology} onChange={(value) => onChange("custom_methodology", value)} required />
        ) : null}
        <ManualInput label="Área de Desenvolvimento" value={form.development_area} onChange={(value) => onChange("development_area", value)} required />
        <ManualSelect label="Tipo de Atividade" value={form.activity_type} options={manualActivityTypes} onChange={(value) => onChange("activity_type", value)} />
        <ManualSelect label="Ambiente" value={form.environment} options={environments} onChange={(value) => onChange("environment", value)} />
        {form.environment === "Outro" ? (
          <ManualInput label="Qual ambiente?" value={form.custom_environment} onChange={(value) => onChange("custom_environment", value)} required />
        ) : null}
      </div>
      <ManualArea label="Materiais Disponíveis" value={form.materials} onChange={(value) => onChange("materials", value)} required />
      <ManualArea label="Objetivo da Atividade" value={form.objective} onChange={(value) => onChange("objective", value)} required />
      <ManualArea label="Passo a passo" value={form.steps_text} onChange={(value) => onChange("steps_text", value)} placeholder="Uma etapa por linha" required />
      <ManualArea label="Observações de segurança" value={form.safety_notes} onChange={(value) => onChange("safety_notes", value)} required />
      <ManualArea label="Anotações" value={form.notes} onChange={(value) => onChange("notes", value)} placeholder="Espaço livre para observações do professor" />
    </div>
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
