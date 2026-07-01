import type { Database } from "@/lib/database.types";

export type LessonMetricDefinition = Database["public"]["Tables"]["lesson_metric_definitions"]["Row"];
export type LessonMetricOption = Database["public"]["Tables"]["lesson_metric_options"]["Row"];
export type LessonMetricPreset = Database["public"]["Tables"]["lesson_metric_presets"]["Row"];
export type LessonMetricPresetItem = Database["public"]["Tables"]["lesson_metric_preset_items"]["Row"];
export type LessonRecord = Database["public"]["Tables"]["lesson_records"]["Row"];
export type LessonRecordStudent = Database["public"]["Tables"]["lesson_record_students"]["Row"];
export type LessonRecordMetric = Database["public"]["Tables"]["lesson_record_metrics"]["Row"];

export type LessonStudentDraft = {
  student_id: string;
  observation: string;
  metrics: Record<string, string>;
};

export function optionsForMetric(options: LessonMetricOption[], metricId: string) {
  return options
    .filter((option) => option.metric_definition_id === metricId)
    .sort((left, right) => left.performance_level - right.performance_level || left.sort_order - right.sort_order);
}

export function buildLessonMetricSummary(
  recordStudents: LessonRecordStudent[],
  metrics: LessonRecordMetric[],
  definitions: LessonMetricDefinition[],
  options: LessonMetricOption[]
) {
  const recordStudentIds = new Set(recordStudents.map((item) => item.id));
  const definitionNames = new Map(definitions.map((definition) => [definition.id, definition.name]));
  const optionLabels = new Map(options.map((option) => [option.id, option.label]));
  const summary: Record<string, Record<string, number>> = {};

  for (const metric of metrics) {
    if (!recordStudentIds.has(metric.lesson_record_student_id)) continue;
    const definitionName = definitionNames.get(metric.metric_definition_id);
    const optionLabel = optionLabels.get(metric.metric_option_id);
    if (!definitionName || !optionLabel) continue;
    summary[definitionName] = summary[definitionName] || {};
    summary[definitionName][optionLabel] = (summary[definitionName][optionLabel] || 0) + 1;
  }

  return summary;
}
