import type { Database } from "@/lib/database.types";

export type StudentAssessment = Database["public"]["Tables"]["student_assessments"]["Row"];
export type AssessmentCriterion = Database["public"]["Tables"]["assessment_criteria"]["Row"];
export type StudentAssessmentCriterion = Database["public"]["Tables"]["student_assessment_criteria"]["Row"];

export const assessmentTypeOptions: Array<{ value: StudentAssessment["assessment_type"]; label: string }> = [
  { value: "exam", label: "Prova" },
  { value: "work", label: "Trabalho" },
  { value: "evaluative_activity", label: "Atividade avaliativa" },
  { value: "homework", label: "Lição de casa" },
  { value: "project", label: "Projeto" },
  { value: "participation", label: "Participação" },
  { value: "reading", label: "Leitura" },
  { value: "other", label: "Outro" }
];

export const deliveryStatusOptions: Array<{ value: NonNullable<StudentAssessment["delivery_status"]>; label: string }> = [
  { value: "on_time", label: "Entregou no prazo" },
  { value: "late", label: "Entregou com atraso" },
  { value: "not_delivered", label: "Não entregou" },
  { value: "not_applicable", label: "Não se aplica" }
];

export const participationLevelOptions: Array<{ value: NonNullable<StudentAssessment["participation_level"]>; label: string }> = [
  { value: "excellent", label: "Excelente" },
  { value: "good", label: "Boa" },
  { value: "regular", label: "Regular" },
  { value: "low", label: "Baixa" },
  { value: "not_evaluated", label: "Não avaliado" }
];

export function assessmentTypeLabel(value: StudentAssessment["assessment_type"]) {
  return assessmentTypeOptions.find((option) => option.value === value)?.label || "Avaliação";
}

export function deliveryStatusLabel(value: StudentAssessment["delivery_status"]) {
  if (!value) return null;
  return deliveryStatusOptions.find((option) => option.value === value)?.label || null;
}

export function participationLevelLabel(value: StudentAssessment["participation_level"]) {
  if (!value) return null;
  return participationLevelOptions.find((option) => option.value === value)?.label || null;
}

export function calculateAssessmentMetrics(assessments: StudentAssessment[]) {
  const scored = assessments.filter(
    (assessment) => assessment.score !== null && assessment.max_score !== null && assessment.max_score > 0
  );
  const averageScorePercentage = scored.length
    ? scored.reduce((total, assessment) => total + ((assessment.score || 0) / (assessment.max_score || 1)) * 100, 0) / scored.length
    : null;
  const delivered = assessments.filter((assessment) =>
    assessment.delivery_status === "on_time" ||
    assessment.delivery_status === "late" ||
    assessment.delivery_status === "not_delivered"
  );
  const onTimePercentage = delivered.length
    ? (delivered.filter((assessment) => assessment.delivery_status === "on_time").length / delivered.length) * 100
    : null;
  const participationIndicators = participationLevelOptions.reduce<Record<string, number>>((acc, option) => {
    acc[option.label] = assessments.filter((assessment) => assessment.participation_level === option.value).length;
    return acc;
  }, {});

  return {
    assessmentCount: assessments.length,
    averageScorePercentage,
    onTimePercentage,
    examCount: assessments.filter((assessment) => assessment.assessment_type === "exam").length,
    workCount: assessments.filter((assessment) => assessment.assessment_type === "work").length,
    participationIndicators
  };
}
