"use client";

import { useState } from "react";
import { BookOpen, Clock, MapPin, ShieldCheck, Target, WandSparkles, X } from "lucide-react";
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
  const [bnccModalOpen, setBnccModalOpen] = useState(false);
  const bnccInfos = activity.bncc_code ? describeBnccCodes(activity.bncc_code) : [];

  return (
    <>
      <article className="panel overflow-hidden">
        <div className="border-b border-ink/10 bg-white px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {activity.methodology ? <span className="badge">{activity.methodology}</span> : null}
            {activity.age_range ? <span className="badge">{activity.age_range}</span> : null}
            {activity.bncc_code ? (
              <button type="button" onClick={() => setBnccModalOpen(true)} className="badge cursor-pointer transition hover:border-leaf/40 hover:bg-mint">
                BNCC {activity.bncc_code}
              </button>
            ) : null}
          </div>
          <h2 className="mt-3 text-xl font-bold text-ink">{activity.title}</h2>
          {activity.description ? <p className="mt-2 text-sm leading-6 text-ink/70">{activity.description}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-ink/10 bg-paper/70 p-5 lg:grid-cols-4">
          <div className="flex min-w-0 gap-2 sm:gap-3">
            <Clock className="mt-0.5 shrink-0 text-ocean" size={18} />
            <div className="min-w-0">
              <p className="label">Tempo</p>
              <p className="break-words text-sm font-semibold">{activity.estimated_time || "A definir"}</p>
            </div>
          </div>
          <div className="flex min-w-0 gap-2 sm:gap-3">
            <Target className="mt-0.5 shrink-0 text-leaf" size={18} />
            <div className="min-w-0">
              <p className="label">Área</p>
              <p className="break-words text-sm font-semibold">{activity.development_area || "A definir"}</p>
            </div>
          </div>
          <div className="flex min-w-0 gap-2 sm:gap-3">
            <WandSparkles className="mt-0.5 shrink-0 text-clay" size={18} />
            <div className="min-w-0">
              <p className="label">Tipo</p>
              <p className="break-words text-sm font-semibold">{activity.activity_type || "A definir"}</p>
            </div>
          </div>
          <div className="flex min-w-0 gap-2 sm:gap-3">
            <MapPin className="mt-0.5 shrink-0 text-ocean" size={18} />
            <div className="min-w-0">
              <p className="label">Ambiente</p>
              <p className="break-words text-sm font-semibold">{activity.environment || "A definir"}</p>
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

      {bnccModalOpen && bnccInfos.length ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">BNCC</p>
                <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
                  <BookOpen size={19} className="text-leaf" />
                  Códigos BNCC
                </h2>
              </div>
              <button type="button" onClick={() => setBnccModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="space-y-4 text-sm leading-6 text-ink/75">
              {bnccInfos.map((info) => (
                <section key={info.code} className="rounded-lg border border-ink/10 bg-white p-4">
                  <h3 className="mb-2 text-sm font-bold text-ink">{info.code}</h3>
                  <div className="space-y-2">
                    {info.lines.map((line) => (
                      <p key={`${info.code}-${line}`}>{line}</p>
                    ))}
                  </div>
                </section>
              ))}
              <p className="rounded-lg border border-ink/10 bg-paper px-4 py-3 text-xs leading-5 text-ink/60">
                A explicação é um resumo orientativo do código. Para o texto oficial da habilidade, consulte a BNCC.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const bnccSkillCatalog: Record<string, string[]> = {
  EF01MA01: [
    "Faz parte do componente curricular de Matemática do 1º ano do Ensino Fundamental na BNCC. Pertence à unidade temática Números.",
    "Consiste em utilizar números naturais como indicador de quantidade ou de ordem em diferentes situações cotidianas e reconhecer situações em que os números não indicam contagem nem ordem, mas sim código de identificação."
  ],
  EF01MA02: [
    "Faz parte do componente curricular de Matemática do 1º ano do Ensino Fundamental na BNCC. Pertence à unidade temática Números.",
    "Consiste em contar de maneira exata ou aproximada, utilizando diferentes estratégias como pareamento, estimativa e agrupamento para determinar quantidades."
  ],
  EF01MA08: [
    "Faz parte do componente curricular de Matemática do 1º ano do Ensino Fundamental na BNCC. Pertence à unidade temática Números.",
    "Consiste em resolver e elaborar problemas de adição e subtração, envolvendo números de até dois algarismos, com apoio de imagens, materiais manipuláveis, registros pessoais e estratégias próprias."
  ],
  EI03EF04: [
    "A habilidade consiste em recontar histórias ouvidas e planejar coletivamente roteiros de vídeos e de encenações, definindo os contextos, os personagens e a estrutura da história.",
    "Ela pertence ao campo de experiência \"Escuta, fala, pensamento e imaginação\". Na prática, desenvolve a comunicação, a criatividade, a memória narrativa e a organização de ideias."
  ],
  EI03ET07: [
    "A habilidade consiste em relacionar números às suas respectivas quantidades e identificar o antes, o depois e o entre em uma sequência.",
    "Ela pertence ao campo de experiência \"Espaços, tempos, quantidades, relações e transformações\". Na prática, fortalece contagem, comparação de quantidades, sequência numérica e noções iniciais de ordem."
  ]
};

function describeBnccCodes(value: string) {
  const matches = value.toUpperCase().match(/\b(?:EI\d{2}[A-Z]{2}\d{2}|EF\d{2}[A-Z]{2}\d{2})\b/g);
  const codes = matches?.length
    ? Array.from(new Set(matches))
    : Array.from(new Set(value.split(/[,\s;]+/).map((item) => item.trim().toUpperCase()).filter(Boolean)));

  return codes.map(describeBnccCode);
}

function describeBnccCode(value: string) {
  const code = value.trim().toUpperCase();
  const catalogLines = bnccSkillCatalog[code];

  if (catalogLines) {
    return {
      code,
      lines: catalogLines
    };
  }

  const earlyChildhood = code.match(/^EI(\d{2})([A-Z]{2})(\d{2})$/);
  const elementary = code.match(/^EF(\d{2})([A-Z]{2})(\d{2})$/);

  if (earlyChildhood) {
    const [, ageGroup, field] = earlyChildhood;
    return {
      code,
      lines: [
        `Este código está relacionado a ${earlyChildhoodAgeGroup(ageGroup)} no campo de experiência "${earlyChildhoodField(field)}".`,
        "Ainda não há uma descrição específica cadastrada para essa habilidade no app. Use essa identificação como apoio inicial e confirme o texto oficial da BNCC para registrar a habilidade com precisão."
      ]
    };
  }

  if (elementary) {
    const [, year, component] = elementary;
    return {
      code,
      lines: [
        `Este código está relacionado ao componente curricular de ${elementaryComponent(component)} no ${elementaryYearLabel(year)} do Ensino Fundamental.`,
        "Ainda não há uma descrição específica cadastrada para essa habilidade no app. Use essa identificação como apoio inicial e confirme o texto oficial da BNCC para registrar a habilidade com precisão."
      ]
    };
  }

  return {
    code,
    lines: [
      `${code} é uma referência associada à BNCC.`,
      "Não foi possível reconhecer automaticamente todos os detalhes desse código, então use-o como referência geral e confirme o texto oficial da habilidade quando necessário."
    ]
  };
}

function elementaryYearLabel(code: string) {
  const year = Number(code);
  if (!year) return "ano ou bloco indicado pela BNCC";
  return `${year}º ano`;
}

function earlyChildhoodAgeGroup(code: string) {
  const groups: Record<string, string> = {
    "01": "bebês, de 0 a 1 ano e 6 meses",
    "02": "crianças bem pequenas, de 1 ano e 7 meses a 3 anos e 11 meses",
    "03": "crianças pequenas, de 4 anos a 5 anos e 11 meses"
  };

  return groups[code] || "grupo etário informado pela BNCC";
}

function earlyChildhoodField(code: string) {
  const fields: Record<string, string> = {
    EO: "O eu, o outro e o nós",
    CG: "Corpo, gestos e movimentos",
    TS: "Traços, sons, cores e formas",
    EF: "Escuta, fala, pensamento e imaginação",
    ET: "Espaços, tempos, quantidades, relações e transformações"
  };

  return fields[code] || "campo de experiências informado pela BNCC";
}

function elementaryComponent(code: string) {
  const components: Record<string, string> = {
    AR: "Arte",
    CI: "Ciências",
    EF: "Educação Física",
    ER: "Ensino Religioso",
    GE: "Geografia",
    HI: "História",
    LP: "Língua Portuguesa",
    MA: "Matemática"
  };

  return components[code] || "componente curricular informado pela BNCC";
}
