"use client";

import { Clock, MapPin, ShieldCheck, Target, WandSparkles } from "lucide-react";
import type { Database } from "@/lib/database.types";

type Activity = Partial<Database["public"]["Tables"]["activities"]["Row"]>;

function list(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  if (!children) return null;

  return (
    <section className="border-t border-ink/10 pt-4">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-6 text-ink/75">{children}</div>
    </section>
  );
}

export function ActivityView({ activity }: { activity: Activity }) {
  const steps = list(activity.steps);
  const tips = list(activity.teacher_tips);
  const variations = list(activity.variations);

  return (
    <article className="panel overflow-hidden">
      <div className="border-b border-ink/10 bg-white px-5 py-4">
        <div className="flex flex-wrap gap-2">
          {activity.methodology ? <span className="badge">{activity.methodology}</span> : null}
          {activity.age_range ? <span className="badge">{activity.age_range}</span> : null}
          {activity.bncc_code ? <span className="badge">BNCC {activity.bncc_code}</span> : null}
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink">{activity.title}</h2>
        {activity.description ? <p className="mt-2 text-sm leading-6 text-ink/70">{activity.description}</p> : null}
      </div>

      <div className="grid gap-3 border-b border-ink/10 bg-paper/70 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex gap-3">
          <Clock className="mt-0.5 text-ocean" size={18} />
          <div>
            <p className="label">Tempo</p>
            <p className="text-sm font-semibold">{activity.estimated_time || "A definir"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Target className="mt-0.5 text-leaf" size={18} />
          <div>
            <p className="label">Área</p>
            <p className="text-sm font-semibold">{activity.development_area || "A definir"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <WandSparkles className="mt-0.5 text-clay" size={18} />
          <div>
            <p className="label">Tipo</p>
            <p className="text-sm font-semibold">{activity.activity_type || "A definir"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <MapPin className="mt-0.5 text-ocean" size={18} />
          <div>
            <p className="label">Ambiente</p>
            <p className="text-sm font-semibold">{activity.environment || "A definir"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <Section title="Materiais necessários">{activity.materials}</Section>
        <Section title="Objetivo pedagógico">{activity.objective}</Section>
        <Section title="Passo a passo">
          {steps.length ? (
            <ol className="space-y-2">
              {steps.map((step, index) => (
                <li key={`${step}-${index}`} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Section>
        <Section title="Dicas para o professor">
          {tips.length ? <ul className="list-disc space-y-1 pl-5">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul> : null}
        </Section>
        <Section title="Variações">
          {variations.length ? (
            <ul className="list-disc space-y-1 pl-5">{variations.map((variation) => <li key={variation}>{variation}</li>)}</ul>
          ) : null}
        </Section>
        <Section title="Observações de segurança">
          <span className="inline-flex gap-2">
            <ShieldCheck size={17} className="mt-1 text-leaf" />
            {activity.safety_notes}
          </span>
        </Section>
        <Section title="Avaliação/observação da criança">{activity.evaluation}</Section>
      </div>
    </article>
  );
}
