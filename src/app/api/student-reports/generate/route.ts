import { createHash } from "crypto";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import type { Database, Json } from "@/lib/database.types";
import { getAnthropicModel, requireServerEnv } from "@/lib/env";
import {
  assessmentTypeLabel,
  calculateAssessmentMetrics,
  deliveryStatusLabel,
  participationLevelLabel
} from "@/lib/students/assessments";
import { createSupabaseUserClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ObservationRow = Database["public"]["Tables"]["student_observations"]["Row"];
type ReportRow = Database["public"]["Tables"]["student_reports"]["Row"];
type AssessmentRow = Database["public"]["Tables"]["student_assessments"]["Row"];
type SupabaseUserClient = ReturnType<typeof createSupabaseUserClient>;

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content?: Array<AnthropicTextBlock | { type: string; [key: string]: unknown }>;
};

const generateReportSchema = z.object({
  mode: z.enum(["individual", "class_batch"]).default("individual"),
  class_id: z.string().uuid(),
  student_id: z.string().uuid().nullable().optional(),
  report_type: z.string().min(2).max(80),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tone: z.string().min(2).max(40),
  force_regenerate: z.boolean().optional().default(false)
});

const forbiddenTerms = [
  "transtorno",
  "déficit",
  "deficit",
  "laudo",
  "suspeita clínica",
  "suspeita clinica",
  "diagnóstico",
  "diagnostico",
  "atraso cognitivo",
  "incapacidade"
];

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = generateReportSchema.parse(await readJson<unknown>(request));

    const { data: classData, error: classError } = await supabase
      .from("classes")
      .select("*")
      .eq("id", payload.class_id)
      .eq("user_id", user.id)
      .single();

    if (classError || !classData) throw classError || Object.assign(new Error("Turma não encontrada."), { status: 404 });

    if (payload.mode === "class_batch") {
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("*")
        .eq("class_id", payload.class_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("name");

      if (studentsError) throw studentsError;

      const reports: Array<{ student: StudentRow; report: ReportRow; cached: boolean }> = [];
      for (const student of students || []) {
        const result = await generateForStudent({
          userId: user.id,
          supabase,
          classData,
          student,
          reportType: payload.report_type,
          periodStart: payload.period_start,
          periodEnd: payload.period_end,
          tone: payload.tone,
          forceRegenerate: payload.force_regenerate
        });
        reports.push(result);
      }

      return ok({ reports, mode: "class_batch" });
    }

    if (!payload.student_id) {
      throw Object.assign(new Error("Selecione um aluno para gerar o relatório individual."), { status: 422 });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("id", payload.student_id)
      .eq("class_id", payload.class_id)
      .eq("user_id", user.id)
      .single();

    if (studentError || !student) throw studentError || Object.assign(new Error("Aluno não encontrado."), { status: 404 });

    const result = await generateForStudent({
      userId: user.id,
      supabase,
      classData,
      student,
      reportType: payload.report_type,
      periodStart: payload.period_start,
      periodEnd: payload.period_end,
      tone: payload.tone,
      forceRegenerate: payload.force_regenerate
    });

    return ok({ ...result, mode: "individual" });
  } catch (error) {
    return fail(error);
  }
}

async function generateForStudent(input: {
  userId: string;
  supabase: SupabaseUserClient;
  classData: ClassRow;
  student: StudentRow;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  tone: string;
  forceRegenerate: boolean;
}) {
  const context = await buildStudentReportContext(input);
  const notesHash = buildNotesHash({
    student_id: input.student.id,
    class_id: input.classData.id,
    report_type: input.reportType,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    tone: input.tone,
    observations: context.relevantObservations.map((observation) => ({
      id: observation.id,
      updated_at: observation.updated_at,
      content: observation.content,
      tags: observation.tags
    })),
    assessments: context.assessments.map((assessment) => ({
      id: assessment.id,
      updated_at: assessment.updated_at,
      assessment_date: assessment.assessment_date,
      assessment_type: assessment.assessment_type,
      title: assessment.title,
      description: assessment.description,
      score: assessment.score,
      max_score: assessment.max_score,
      delivery_status: assessment.delivery_status,
      participation_level: assessment.participation_level,
      comments: assessment.comments,
      criteria: context.criteriaByAssessment[assessment.id] || []
    })),
    previous_reports: context.previousReports.map((report) => ({
      id: report.id,
      updated_at: report.updated_at,
      notes_hash: report.notes_hash
    }))
  });

  const { data: cachedReport, error: cacheError } = await input.supabase
    .from("student_reports")
    .select("*")
    .eq("user_id", input.userId)
    .eq("class_id", input.classData.id)
    .eq("student_id", input.student.id)
    .eq("report_type", input.reportType)
    .eq("period_start", input.periodStart)
    .eq("period_end", input.periodEnd)
    .eq("tone", input.tone)
    .eq("notes_hash", notesHash)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cacheError) throw cacheError;
  if (cachedReport && !input.forceRegenerate) {
    return { student: input.student, report: cachedReport, cached: true };
  }

  const startedAt = Date.now();
  const generation = await callClaudeForReport({
    classData: input.classData,
    student: input.student,
    reportType: input.reportType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tone: input.tone,
    context
  });

  const reportInsertPayload = {
    user_id: input.userId,
    class_id: input.classData.id,
    student_id: input.student.id,
    report_type: input.reportType,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    tone: input.tone,
    content: generation.content,
    structured_content: generation.structuredContent as Json,
    notes_hash: notesHash,
    generated_at: new Date().toISOString()
  };
  const reportUpdatePayload = {
    report_type: input.reportType,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    tone: input.tone,
    content: generation.content,
    structured_content: generation.structuredContent as Json,
    notes_hash: notesHash,
    generated_at: reportInsertPayload.generated_at
  };

  let report: ReportRow;
  if (cachedReport?.id && input.forceRegenerate) {
    const { data, error } = await input.supabase
      .from("student_reports")
      .update(reportUpdatePayload)
      .eq("id", cachedReport.id)
      .eq("user_id", input.userId)
      .select("*")
      .single();
    if (error) throw error;
    report = data;
  } else {
    const { data, error } = await input.supabase
      .from("student_reports")
      .insert(reportInsertPayload)
      .select("*")
      .single();
    if (error) throw error;
    report = data;
  }

  await input.supabase.from("report_generation_logs").insert({
    user_id: input.userId,
    report_id: report.id,
    model: getAnthropicModel(),
    report_type: input.reportType,
    input_tokens: generation.inputTokens,
    output_tokens: generation.outputTokens,
    estimated_cost: null
  });

  return {
    student: input.student,
    report,
    cached: false,
    generation_time: Date.now() - startedAt
  };
}

async function buildStudentReportContext(input: {
  userId: string;
  supabase: SupabaseUserClient;
  classData: ClassRow;
  student: StudentRow;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  tone: string;
}) {
  const { data: observations, error: observationsError } = await input.supabase
    .from("student_observations")
    .select("*")
    .eq("user_id", input.userId)
    .eq("class_id", input.classData.id)
    .lte("date", input.periodEnd)
    .gte("date", input.periodStart)
    .order("date", { ascending: true });

  if (observationsError) throw observationsError;
  const observationIds = (observations || []).map((observation) => observation.id);

  const { data: links, error: linksError } = observationIds.length
    ? await input.supabase
      .from("observation_students")
      .select("observation_id, student_id")
      .in("observation_id", observationIds)
    : { data: [], error: null };

  if (linksError) throw linksError;

  const linkedObservationIds = new Set(
    (links || [])
      .filter((link) => link.student_id === input.student.id)
      .map((link) => link.observation_id)
  );

  const relevantObservations = (observations || []).filter((observation) => {
    if (observation.applies_to === "all_class") return true;
    if (observation.applies_to === "none") return observation.observation_type === "class";
    return linkedObservationIds.has(observation.id);
  });

  const { data: assessments, error: assessmentsError } = await input.supabase
    .from("student_assessments")
    .select("*")
    .eq("user_id", input.userId)
    .eq("class_id", input.classData.id)
    .eq("student_id", input.student.id)
    .lte("assessment_date", input.periodEnd)
    .gte("assessment_date", input.periodStart)
    .order("assessment_date", { ascending: true });

  if (assessmentsError) throw assessmentsError;
  const assessmentIds = (assessments || []).map((assessment) => assessment.id);
  const { data: assessmentLinks, error: assessmentLinksError } = assessmentIds.length
    ? await input.supabase
      .from("student_assessment_criteria")
      .select("assessment_id, criterion_id")
      .in("assessment_id", assessmentIds)
    : { data: [], error: null };

  if (assessmentLinksError) throw assessmentLinksError;
  const criterionIds = Array.from(new Set((assessmentLinks || []).map((link) => link.criterion_id)));
  const { data: criteria, error: criteriaError } = criterionIds.length
    ? await input.supabase
      .from("assessment_criteria")
      .select("id, name")
      .in("id", criterionIds)
    : { data: [], error: null };

  if (criteriaError) throw criteriaError;
  const criterionNames = new Map((criteria || []).map((criterion) => [criterion.id, criterion.name]));
  const criteriaByAssessment = (assessmentLinks || []).reduce<Record<string, string[]>>((acc, link) => {
    const name = criterionNames.get(link.criterion_id);
    if (!name) return acc;
    acc[link.assessment_id] = [...(acc[link.assessment_id] || []), name];
    return acc;
  }, {});
  const assessmentMetrics = calculateAssessmentMetrics(assessments || []);

  const { data: previousReports, error: previousReportsError } = await input.supabase
    .from("student_reports")
    .select("*")
    .eq("user_id", input.userId)
    .eq("student_id", input.student.id)
    .order("generated_at", { ascending: false })
    .limit(2);

  if (previousReportsError) throw previousReportsError;

  return {
    relevantObservations,
    classObservations: relevantObservations.filter((observation) => observation.applies_to === "all_class"),
    individualObservations: relevantObservations.filter((observation) => linkedObservationIds.has(observation.id)),
    assessments: assessments || [],
    criteriaByAssessment,
    assessmentMetrics,
    previousReports: previousReports || []
  };
}

async function callClaudeForReport(input: {
  classData: ClassRow;
  student: StudentRow;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  tone: string;
  context: {
    relevantObservations: ObservationRow[];
    classObservations: ObservationRow[];
    individualObservations: ObservationRow[];
    assessments: AssessmentRow[];
    criteriaByAssessment: Record<string, string[]>;
    assessmentMetrics: ReturnType<typeof calculateAssessmentMetrics>;
    previousReports: ReportRow[];
  };
}) {
  if (!input.context.relevantObservations.length && !input.context.assessments.length) {
    return {
      content:
        "Ainda há poucos registros para gerar um relatório consistente. Você pode adicionar mais observações ou gerar uma versão inicial com base nos dados disponíveis.",
      structuredContent: {
        warning: "insufficient_records",
        observations_count: 0,
        assessments_count: 0
      },
      inputTokens: null,
      outputTokens: null
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": requireServerEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: getAnthropicModel(),
      max_tokens: 1800,
      temperature: 0.25,
      system:
        "Voce gera relatorios pedagogicos para professoras da Educacao Infantil e Fundamental 1. Use linguagem acolhedora, objetiva e pedagogica. Nunca use linguagem diagnostica, clinica ou termos proibidos.",
      messages: [
        {
          role: "user",
          content: buildReportPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) throw new Error(await response.text());
  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.find((block): block is AnthropicTextBlock => block.type === "text")?.text || "";
  const content = sanitizeReportText(text.trim());

  return {
    content,
    structuredContent: {
      student_id: input.student.id,
      student_name: input.student.name,
      report_type: input.reportType,
      tone: input.tone,
      observations_count: input.context.relevantObservations.length,
      assessments_count: input.context.assessments.length,
      assessment_metrics: input.context.assessmentMetrics,
      generated_notice: "Relatório gerado a partir dos registros pedagógicos salvos pela professora."
    },
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null
  };
}

function buildReportPrompt(input: Parameters<typeof callClaudeForReport>[0]) {
  return `
Vamos montar uma síntese pedagógica com base nos registros salvos.

Dados:
- Aluno: ${input.student.name}
- Data de nascimento: ${input.student.birth_date || "não informada"}
- Observação geral do aluno: ${input.student.general_notes || "não informada"}
- Turma: ${input.classData.name}
- Turno/período: ${input.classData.shift || "não informado"}
- Ano/série: ${input.classData.school_year || "não informado"}
- Tipo de relatório: ${input.reportType}
- Tom desejado: ${input.tone}
- Período: ${input.periodStart} a ${input.periodEnd}

Observações diretamente relacionadas ao aluno:
${formatObservations(input.context.individualObservations)}

Observações gerais da turma no período, apenas como contexto:
${formatObservations(input.context.classObservations)}

Avaliações estruturadas do aluno no período:
${formatAssessments(input.context.assessments, input.context.criteriaByAssessment)}

Indicadores objetivos das avaliações:
- Quantidade de avaliações: ${input.context.assessmentMetrics.assessmentCount}
- Média proporcional das notas: ${formatPercentage(input.context.assessmentMetrics.averageScorePercentage)}
- Entregas no prazo: ${formatPercentage(input.context.assessmentMetrics.onTimePercentage)}
- Quantidade de provas: ${input.context.assessmentMetrics.examCount}
- Quantidade de trabalhos: ${input.context.assessmentMetrics.workCount}
- Indicadores de participação: ${formatParticipationIndicators(input.context.assessmentMetrics.participationIndicators)}

Relatórios anteriores, se úteis:
${input.context.previousReports.map((report) => `- ${report.generated_at}: ${report.content.slice(0, 600)}`).join("\n") || "Nenhum relatório anterior."}

Regras obrigatórias:
- Gere um texto avaliativo claro.
- Inclua avanços observados.
- Inclua pontos que ainda precisam de acompanhamento, se houver base nos registros.
- Aborde participação, autonomia, socialização e desenvolvimento nas atividades quando houver evidências.
- Use as avaliações e seus indicadores para complementar as observações, sem transformar o relatório em um boletim numérico.
- Não invente conclusões quando um indicador não estiver disponível.
- Sugestões pedagógicas só podem aparecer se forem personalizadas para este aluno e conectadas às observações.
- Não gere sugestões genéricas.
- Evite linguagem diagnóstica.
- Não use estes termos: ${forbiddenTerms.join(", ")}.
- Prefira expressões como "necessita de mediação", "vem desenvolvendo", "demonstra evolução", "beneficia-se de", "responde melhor quando", "ainda precisa de apoio em".
- Deixe claro ao final: "Relatório gerado a partir dos registros pedagógicos salvos pela professora."
- Escreva em português brasileiro.
- Não invente fatos, datas ou comportamentos que não estejam nos registros.
`;
}

function formatAssessments(assessments: AssessmentRow[], criteriaByAssessment: Record<string, string[]>) {
  if (!assessments.length) return "Nenhuma avaliação registrada no período.";
  return assessments
    .map((assessment) => {
      const score = assessment.score === null
        ? "sem nota"
        : `${assessment.score}${assessment.max_score === null ? "" : `/${assessment.max_score}`}`;
      const delivery = deliveryStatusLabel(assessment.delivery_status) || "não informada";
      const participation = participationLevelLabel(assessment.participation_level) || "não avaliada";
      const criteria = criteriaByAssessment[assessment.id]?.join(", ") || "não informados";
      return `- ${assessment.assessment_date} [${assessmentTypeLabel(assessment.assessment_type)}] ${assessment.title || "Sem título"}. Nota: ${score}. Entrega: ${delivery}. Participação: ${participation}. Critérios: ${criteria}. Descrição: ${assessment.description || "não informada"}. Comentários: ${assessment.comments || "não informados"}.`;
    })
    .join("\n");
}

function formatPercentage(value: number | null) {
  return value === null ? "não disponível" : `${Math.round(value)}%`;
}

function formatParticipationIndicators(indicators: Record<string, number>) {
  const visible = Object.entries(indicators).filter(([, count]) => count > 0);
  return visible.length ? visible.map(([label, count]) => `${label}: ${count}`).join(", ") : "não disponíveis";
}

function formatObservations(observations: ObservationRow[]) {
  if (!observations.length) return "Nenhuma observação específica.";
  return observations
    .map((observation) => {
      const tags = observation.tags?.length ? ` Tags: ${observation.tags.join(", ")}.` : "";
      return `- ${observation.date} [${observation.observation_type}] ${observation.title || ""}: ${observation.content}${tags}`;
    })
    .join("\n");
}

function buildNotesHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(sortJson(value)))
    .digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

function sanitizeReportText(value: string) {
  let text = value || "Não foi possível gerar o relatório com os registros disponíveis.";
  for (const term of forbiddenTerms) {
    text = text.replace(new RegExp(term, "gi"), "termo clínico removido");
  }
  return text;
}
