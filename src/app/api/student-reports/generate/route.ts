import { createHash } from "crypto";
import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import type { Database, Json } from "@/lib/database.types";
import { getAnthropicModel, requireServerEnv } from "@/lib/env";
import {
  buildLessonMetricSummary,
  type LessonMetricDefinition,
  type LessonMetricOption,
  type LessonRecord,
  type LessonRecordMetric,
  type LessonRecordStudent
} from "@/lib/students/lesson-records";
import { createSupabaseUserClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ObservationRow = Database["public"]["Tables"]["student_observations"]["Row"];
type ReportRow = Database["public"]["Tables"]["student_reports"]["Row"];
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
    lesson_evidence: context.lessonRecordStudents.map((recordStudent) => ({
      id: recordStudent.id,
      updated_at: recordStudent.updated_at,
      observation: recordStudent.observation,
      lesson: context.lessonRecords.find((record) => record.id === recordStudent.lesson_record_id),
      metrics: context.lessonRecordMetrics.filter((metric) => metric.lesson_record_student_id === recordStudent.id)
    })),
    lesson_metric_summary: context.lessonMetricSummary,
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

  const { data: lessonRecords, error: lessonRecordsError } = await input.supabase
    .from("lesson_records")
    .select("*")
    .eq("user_id", input.userId)
    .eq("class_id", input.classData.id)
    .lte("lesson_date", input.periodEnd)
    .gte("lesson_date", input.periodStart)
    .order("lesson_date", { ascending: true });

  if (lessonRecordsError) throw lessonRecordsError;
  const lessonRecordIds = (lessonRecords || []).map((record) => record.id);
  const { data: lessonRecordStudents, error: lessonRecordStudentsError } = lessonRecordIds.length
    ? await input.supabase
      .from("lesson_record_students")
      .select("*")
      .eq("student_id", input.student.id)
      .in("lesson_record_id", lessonRecordIds)
    : { data: [], error: null };

  if (lessonRecordStudentsError) throw lessonRecordStudentsError;
  const relevantLessonRecordIds = new Set((lessonRecordStudents || []).map((item) => item.lesson_record_id));
  const relevantLessonRecords = (lessonRecords || []).filter((record) => relevantLessonRecordIds.has(record.id));
  const lessonRecordStudentIds = (lessonRecordStudents || []).map((item) => item.id);
  const { data: lessonRecordMetrics, error: lessonRecordMetricsError } = lessonRecordStudentIds.length
    ? await input.supabase
      .from("lesson_record_metrics")
      .select("*")
      .in("lesson_record_student_id", lessonRecordStudentIds)
    : { data: [], error: null };

  if (lessonRecordMetricsError) throw lessonRecordMetricsError;
  const metricDefinitionIds = Array.from(new Set((lessonRecordMetrics || []).map((metric) => metric.metric_definition_id)));
  const metricOptionIds = Array.from(new Set((lessonRecordMetrics || []).map((metric) => metric.metric_option_id)));
  const { data: metricDefinitions, error: metricDefinitionsError } = metricDefinitionIds.length
    ? await input.supabase.from("lesson_metric_definitions").select("*").in("id", metricDefinitionIds)
    : { data: [], error: null };
  const { data: metricOptions, error: metricOptionsError } = metricOptionIds.length
    ? await input.supabase.from("lesson_metric_options").select("*").in("id", metricOptionIds)
    : { data: [], error: null };

  if (metricDefinitionsError) throw metricDefinitionsError;
  if (metricOptionsError) throw metricOptionsError;
  const lessonMetricSummary = buildLessonMetricSummary(
    lessonRecordStudents || [],
    lessonRecordMetrics || [],
    metricDefinitions || [],
    metricOptions || []
  );

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
    lessonRecords: relevantLessonRecords,
    lessonRecordStudents: lessonRecordStudents || [],
    lessonRecordMetrics: lessonRecordMetrics || [],
    metricDefinitions: metricDefinitions || [],
    metricOptions: metricOptions || [],
    lessonMetricSummary,
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
    lessonRecords: LessonRecord[];
    lessonRecordStudents: LessonRecordStudent[];
    lessonRecordMetrics: LessonRecordMetric[];
    metricDefinitions: LessonMetricDefinition[];
    metricOptions: LessonMetricOption[];
    lessonMetricSummary: Record<string, Record<string, number>>;
    previousReports: ReportRow[];
  };
}) {
  if (!input.context.relevantObservations.length && !input.context.lessonRecordStudents.length) {
    return {
      content:
        "Ainda há poucos registros para gerar um relatório consistente. Você pode adicionar mais observações ou gerar uma versão inicial com base nos dados disponíveis.",
      structuredContent: {
        warning: "insufficient_records",
        observations_count: 0,
        lesson_evidence_count: 0
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
      lesson_evidence_count: input.context.lessonRecordStudents.length,
      lesson_metric_summary: input.context.lessonMetricSummary,
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

Evidências individuais registradas durante as aulas no período:
${formatLessonEvidence(input.context)}

Frequência dos indicadores observados nas aulas:
${formatLessonMetricSummary(input.context.lessonMetricSummary)}

Relatórios anteriores, se úteis:
${input.context.previousReports.map((report) => `- ${report.generated_at}: ${report.content.slice(0, 600)}`).join("\n") || "Nenhum relatório anterior."}

Regras obrigatórias:
- Gere um texto avaliativo claro.
- Inclua avanços observados.
- Inclua pontos que ainda precisam de acompanhamento, se houver base nos registros.
- Aborde participação, autonomia, socialização e desenvolvimento nas atividades quando houver evidências.
- Use as evidências das aulas e a frequência dos indicadores para complementar naturalmente as observações.
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

function formatLessonEvidence(context: Parameters<typeof callClaudeForReport>[0]["context"]) {
  if (!context.lessonRecordStudents.length) return "Nenhuma evidência de aula registrada no período.";
  const definitionNames = new Map(context.metricDefinitions.map((definition) => [definition.id, definition.name]));
  const optionLabels = new Map(context.metricOptions.map((option) => [option.id, option.label]));

  return context.lessonRecordStudents.map((recordStudent) => {
    const record = context.lessonRecords.find((item) => item.id === recordStudent.lesson_record_id);
    const indicators = context.lessonRecordMetrics
      .filter((metric) => metric.lesson_record_student_id === recordStudent.id)
      .map((metric) => `${definitionNames.get(metric.metric_definition_id) || "Indicador"}: ${optionLabels.get(metric.metric_option_id) || "não informado"}`)
      .join(", ");
    return `- ${record?.lesson_date || "data não informada"} — ${record?.activity_title || "Atividade"}. ${indicators || "Sem indicadores marcados"}. Observação: ${recordStudent.observation || "não informada"}.`;
  }).join("\n");
}

function formatLessonMetricSummary(summary: Record<string, Record<string, number>>) {
  const metrics = Object.entries(summary);
  if (!metrics.length) return "Nenhum indicador contabilizado.";
  return metrics
    .map(([metricName, values]) => {
      const total = Object.values(values).reduce((sum, count) => sum + count, 0);
      const formatted = Object.entries(values)
        .map(([label, count]) => `${label} em ${count} aula${count === 1 ? "" : "s"} (${total ? Math.round((count / total) * 100) : 0}%)`)
        .join(", ");
      return `- ${metricName}: ${formatted}`;
    })
    .join("\n");
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
