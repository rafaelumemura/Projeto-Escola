"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, MessageSquareText, Plus, Save, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";
import {
  optionsForMetric,
  type LessonMetricDefinition,
  type LessonMetricOption,
  type LessonMetricPreset,
  type LessonMetricPresetItem,
  type LessonRecordMetric,
  type LessonRecordStudent,
  type LessonStudentDraft
} from "@/lib/students/lesson-records";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];
type LessonRecord = Database["public"]["Tables"]["lesson_records"]["Row"];

export function ClassLessonRecordModal({
  classItem,
  activities,
  onClose,
  onSaved,
  onError
}: {
  classItem: ClassRow;
  activities: Activity[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { supabase } = useAuth();
  const lessonDate = localDateValue(new Date());
  const [selectedActivityId, setSelectedActivityId] = useState(activities[0]?.id || "");
  const [students, setStudents] = useState<Student[]>([]);
  const [definitions, setDefinitions] = useState<LessonMetricDefinition[]>([]);
  const [options, setOptions] = useState<LessonMetricOption[]>([]);
  const [presets, setPresets] = useState<LessonMetricPreset[]>([]);
  const [presetItems, setPresetItems] = useState<LessonMetricPresetItem[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LessonStudentDraft>>({});
  const [existingRecord, setExistingRecord] = useState<LessonRecord | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const activity = activities.find((item) => item.id === selectedActivityId) || activities[0] || null;
  const selectedDefinitions = useMemo(
    () => selectedMetricIds
      .map((id) => definitions.find((definition) => definition.id === id))
      .filter((definition): definition is LessonMetricDefinition => Boolean(definition)),
    [definitions, selectedMetricIds]
  );
  const availableDefinitions = useMemo(
    () => definitions.filter((definition) => definition.is_active && !selectedMetricIds.includes(definition.id)),
    [definitions, selectedMetricIds]
  );
  const desktopColumns = `minmax(180px, 1.2fr) repeat(${Math.max(selectedDefinitions.length, 1)}, minmax(150px, 1fr)) 56px`;

  useEffect(() => {
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem.id, selectedActivityId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  async function loadForm() {
    if (!activity) return;
    setLoading(true);
    try {
      const [studentsResponse, definitionsResponse, optionsResponse, presetsResponse, presetItemsResponse, recordResponse] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", classItem.id).eq("status", "active").order("name"),
        supabase.from("lesson_metric_definitions").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("lesson_metric_options").select("*").order("performance_level"),
        supabase.from("lesson_metric_presets").select("*").eq("is_active", true).order("priority", { ascending: false }),
        supabase.from("lesson_metric_preset_items").select("*").order("sort_order"),
        supabase
          .from("lesson_records")
          .select("*")
          .eq("class_id", classItem.id)
          .eq("activity_id", activity.id)
          .eq("lesson_date", lessonDate)
          .eq("source", "class")
          .maybeSingle()
      ]);

      if (studentsResponse.error) throw studentsResponse.error;
      if (definitionsResponse.error) throw definitionsResponse.error;
      if (optionsResponse.error) throw optionsResponse.error;
      if (presetsResponse.error) throw presetsResponse.error;
      if (presetItemsResponse.error) throw presetItemsResponse.error;
      if (recordResponse.error) throw recordResponse.error;

      const nextStudents = studentsResponse.data || [];
      const nextDefinitions = definitionsResponse.data || [];
      const nextPresets = presetsResponse.data || [];
      const nextPresetItems = presetItemsResponse.data || [];
      const record = recordResponse.data || null;
      let recordStudents: LessonRecordStudent[] = [];
      let recordMetrics: LessonRecordMetric[] = [];

      if (record) {
        const recordStudentsResponse = await supabase.from("lesson_record_students").select("*").eq("lesson_record_id", record.id);
        if (recordStudentsResponse.error) throw recordStudentsResponse.error;
        recordStudents = recordStudentsResponse.data || [];
        const recordStudentIds = recordStudents.map((item) => item.id);
        if (recordStudentIds.length) {
          const metricsResponse = await supabase.from("lesson_record_metrics").select("*").in("lesson_record_student_id", recordStudentIds);
          if (metricsResponse.error) throw metricsResponse.error;
          recordMetrics = metricsResponse.data || [];
        }
      }

      const preset = findActivityPreset(activity, nextPresets);
      const suggestedMetricIds = nextPresetItems
        .filter((item) => item.preset_id === preset?.id)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((item) => item.metric_definition_id);
      const existingMetricIds = Array.from(new Set(recordMetrics.map((metric) => metric.metric_definition_id)));
      const nextSelectedMetricIds = existingMetricIds.length ? existingMetricIds : suggestedMetricIds;
      const fallbackMetricIds = nextDefinitions.slice(0, 3).map((definition) => definition.id);

      const nextDrafts = nextStudents.reduce<Record<string, LessonStudentDraft>>((acc, student) => {
        const recordStudent = recordStudents.find((item) => item.student_id === student.id);
        const selectedMetrics = recordStudent
          ? recordMetrics
            .filter((metric) => metric.lesson_record_student_id === recordStudent.id)
            .reduce<Record<string, string>>((metricAcc, metric) => {
              metricAcc[metric.metric_definition_id] = metric.metric_option_id;
              return metricAcc;
            }, {})
          : {};
        acc[student.id] = {
          student_id: student.id,
          observation: recordStudent?.observation || "",
          metrics: selectedMetrics
        };
        return acc;
      }, {});

      setStudents(nextStudents);
      setDefinitions(nextDefinitions);
      setOptions(optionsResponse.data || []);
      setPresets(nextPresets);
      setPresetItems(nextPresetItems);
      setSelectedMetricIds(nextSelectedMetricIds.length ? nextSelectedMetricIds : fallbackMetricIds);
      setExistingRecord(record);
      setDrafts(nextDrafts);
      setOpenComments(new Set(recordStudents.filter((item) => item.observation).map((item) => item.student_id)));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível carregar o registro da aula.");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function selectMetric(studentId: string, metricId: string, optionId: string) {
    setDrafts((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] || { student_id: studentId, observation: "", metrics: {} }),
        metrics: { ...(current[studentId]?.metrics || {}), [metricId]: optionId }
      }
    }));
  }

  function updateObservation(studentId: string, observation: string) {
    setDrafts((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] || { student_id: studentId, observation: "", metrics: {} }),
        observation
      }
    }));
  }

  function removeCriterion(metricId: string) {
    if (selectedMetricIds.length === 1) return;
    setSelectedMetricIds((current) => current.filter((id) => id !== metricId));
  }

  function addCriterion(metricId: string) {
    setSelectedMetricIds((current) => [...current, metricId]);
  }

  function toggleComment(studentId: string) {
    setOpenComments((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function saveLessonRecord() {
    if (!activity || !students.length) return;
    setBusy(true);
    try {
      await apiFetch(supabase, "/api/lesson-records", {
        method: "POST",
        body: {
          class_id: classItem.id,
          activity_id: activity.id,
          lesson_date: lessonDate,
          students: students.map((student) => {
            const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
            return {
              student_id: student.id,
              observation: draft.observation,
              metrics: selectedMetricIds
                .filter((metricId) => draft.metrics[metricId])
                .map((metricId) => ({ metric_id: metricId, option_id: draft.metrics[metricId] }))
            };
          })
        }
      });
      onSaved(existingRecord ? "Registro da aula atualizado." : "Aula registrada para todos os alunos.");
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível salvar o registro da aula.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink/45 px-2 py-3 sm:px-5 sm:py-6" role="dialog" aria-modal="true" aria-labelledby="class-lesson-title">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label mb-1">Registro da aula</p>
              <h2 id="class-lesson-title" className="truncate text-xl font-bold text-ink sm:text-2xl">{activity?.title || "Escolha uma atividade"}</h2>
              {activity ? (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink/55">
                  <span><strong className="text-ink">Turma:</strong> {classItem.name}{classItem.shift ? ` - ${classItem.shift}` : ""}</span>
                  <span><strong className="text-ink">Data:</strong> {formatDate(lessonDate)}</span>
                  <span><strong className="text-ink">Área:</strong> {activity.development_area || "Não informada"}</span>
                  <span><strong className="text-ink">Metodologia:</strong> {activity.methodology || "Não informada"}</span>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink disabled:opacity-50" title="Fechar" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-4 sm:p-6">
          {activities.length > 1 ? (
            <section>
              <p className="label mb-2">Atividade realizada</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {activities.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedActivityId(item.id)}
                    className={`min-w-[190px] max-w-xs rounded-lg border px-3 py-2 text-left text-sm font-bold transition ${selectedActivityId === item.id ? "border-leaf bg-mint text-leaf ring-2 ring-leaf/15" : "border-ink/10 bg-white text-ink hover:border-leaf/35"}`}
                  >
                    <span className="line-clamp-2">{item.title}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {loading ? (
            <p className="py-16 text-center text-sm font-semibold text-ink/55">Preparando a ficha da turma...</p>
          ) : students.length && activity ? (
            <>
              <section className="rounded-lg border border-ink/10 bg-paper/55 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="label">Critérios sugeridos</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedDefinitions.map((definition) => (
                        <span key={definition.id} className="inline-flex items-center gap-1.5 rounded-full border border-leaf/25 bg-mint px-3 py-1.5 text-xs font-bold text-leaf">
                          <Check size={13} />
                          {definition.name}
                          <button type="button" onClick={() => removeCriterion(definition.id)} disabled={selectedDefinitions.length === 1} className="ml-0.5 text-leaf/55 hover:text-clay disabled:cursor-not-allowed disabled:opacity-30" title={`Remover ${definition.name}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  {availableDefinitions.length ? (
                    <div className="lg:max-w-xl">
                      <p className="label">Adicionar critério</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availableDefinitions.map((definition) => (
                          <button key={definition.id} type="button" onClick={() => addCriterion(definition.id)} className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-bold text-ink/60 hover:border-leaf/35 hover:text-leaf">
                            <Plus size={13} />
                            {definition.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="hidden overflow-x-auto rounded-lg border border-ink/10 lg:block">
                <div className="min-w-[980px]">
                  <div className="sticky top-[105px] z-10 grid gap-3 border-b border-ink/10 bg-paper px-4 py-3" style={{ gridTemplateColumns: desktopColumns }}>
                    <span className="label self-center">Aluno</span>
                    {selectedDefinitions.map((definition) => (
                      <MetricLegend key={definition.id} definition={definition} options={optionsForMetric(options, definition.id)} compact />
                    ))}
                    <span className="label self-center text-center">Nota</span>
                  </div>

                  <div className="divide-y divide-ink/10">
                    {students.map((student) => {
                      const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
                      return (
                        <div key={student.id} className="px-4 py-3">
                          <div className="grid items-center gap-3" style={{ gridTemplateColumns: desktopColumns }}>
                            <p className="truncate text-sm font-bold text-ink">{student.name}</p>
                            {selectedDefinitions.map((definition) => (
                              <PerformanceDots
                                key={definition.id}
                                student={student}
                                definition={definition}
                                options={optionsForMetric(options, definition.id)}
                                selectedOptionId={draft.metrics[definition.id]}
                                onSelect={selectMetric}
                              />
                            ))}
                            <button type="button" onClick={() => toggleComment(student.id)} className={`mx-auto grid h-9 w-9 place-items-center rounded-full border transition ${openComments.has(student.id) || draft.observation ? "border-leaf/30 bg-mint text-leaf" : "border-ink/10 text-ink/40 hover:border-leaf/35 hover:text-leaf"}`} title={`Observação sobre ${student.name}`} aria-expanded={openComments.has(student.id)}>
                              <MessageSquareText size={16} />
                            </button>
                          </div>
                          {openComments.has(student.id) ? (
                            <div className="ml-[calc(180px+1rem)] mt-3">
                              <textarea value={draft.observation} maxLength={1000} onChange={(event) => updateObservation(student.id, event.target.value)} className="input min-h-20 text-sm" placeholder={`Observação opcional sobre ${student.name}`} autoFocus />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="space-y-3 lg:hidden">
                <div className="rounded-lg border border-ink/10 bg-paper p-3">
                  <p className="label mb-3">Legenda de desempenho</p>
                  <GlobalLegend options={options} />
                </div>
                {students.map((student) => {
                  const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
                  return (
                    <article key={student.id} className="rounded-lg border border-ink/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-bold text-ink">{student.name}</h3>
                        <button type="button" onClick={() => toggleComment(student.id)} className={`grid h-9 w-9 place-items-center rounded-full border ${openComments.has(student.id) || draft.observation ? "border-leaf/30 bg-mint text-leaf" : "border-ink/10 text-ink/40"}`} title={`Observação sobre ${student.name}`} aria-expanded={openComments.has(student.id)}>
                          <MessageSquareText size={16} />
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {selectedDefinitions.map((definition) => (
                          <div key={definition.id}>
                            <p className="label mb-2">{definition.name}</p>
                            <PerformanceDots student={student} definition={definition} options={optionsForMetric(options, definition.id)} selectedOptionId={draft.metrics[definition.id]} onSelect={selectMetric} />
                          </div>
                        ))}
                      </div>
                      {openComments.has(student.id) ? (
                        <textarea value={draft.observation} maxLength={1000} onChange={(event) => updateObservation(student.id, event.target.value)} className="input mt-4 min-h-20 text-sm" placeholder="Observação opcional" autoFocus />
                      ) : null}
                    </article>
                  );
                })}
              </section>
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-ink/55">Nenhum aluno ativo cadastrado nesta turma.</p>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-ink/10 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={() => void saveLessonRecord()} disabled={busy || loading || !students.length || !activity} className="btn-primary disabled:opacity-50">
            {existingRecord ? <Save size={16} /> : <ClipboardCheck size={16} />}
            {busy ? "Salvando..." : existingRecord ? "Atualizar registro" : "Salvar registro da aula"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function PerformanceDots({
  student,
  definition,
  options,
  selectedOptionId,
  onSelect
}: {
  student: Student;
  definition: LessonMetricDefinition;
  options: LessonMetricOption[];
  selectedOptionId?: string;
  onSelect: (studentId: string, metricId: string, optionId: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label={`${definition.name} de ${student.name}`}>
      {options.map((option) => {
        const active = selectedOptionId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${definition.name}: ${option.label}`}
            title={option.label}
            onClick={() => onSelect(student.id, definition.id, option.id)}
            className={`h-7 w-7 shrink-0 rounded-full border-2 transition duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-leaf/35 focus:ring-offset-2 ${active ? "scale-110 border-white shadow-[0_0_0_3px_rgba(24,115,81,0.45)]" : "border-white/80 opacity-65 hover:opacity-100"}`}
            style={{ backgroundColor: option.color }}
          />
        );
      })}
    </div>
  );
}

function MetricLegend({ definition, options, compact = false }: { definition: LessonMetricDefinition; options: LessonMetricOption[]; compact?: boolean }) {
  return (
    <div>
      <p className="label text-center">{definition.name}</p>
      <div className={`mt-2 flex flex-wrap justify-center ${compact ? "gap-x-2 gap-y-1" : "gap-2"}`}>
        {options.map((option) => (
          <span key={option.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink/55" title={option.label}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.color }} />
            <span className={compact ? "max-w-[64px] truncate" : ""}>{option.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function GlobalLegend({ options }: { options: LessonMetricOption[] }) {
  const uniqueLevels = Array.from(new Map(
    options
      .sort((left, right) => left.performance_level - right.performance_level)
      .map((option) => [option.performance_level, option])
  ).values());
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {uniqueLevels.map((option) => (
        <span key={option.performance_level} className="flex items-center gap-2 text-xs font-semibold text-ink/65">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: option.color }} />
          {performanceLevelLabel(option.performance_level)}
        </span>
      ))}
    </div>
  );
}

function findActivityPreset(activity: Activity, presets: LessonMetricPreset[]) {
  const searchable = normalizeText([
    activity.development_area,
    activity.activity_type,
    activity.title,
    activity.objective
  ].filter(Boolean).join(" "));
  return presets.find((preset) => !preset.is_default && preset.match_terms.some((term) => searchable.includes(normalizeText(term))))
    || presets.find((preset) => preset.is_default)
    || presets[0];
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function performanceLevelLabel(level: number) {
  return ["", "Necessita muita atenção", "Abaixo do esperado", "Em desenvolvimento", "Bom desempenho", "Excelente desempenho"][level] || "Desempenho";
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
