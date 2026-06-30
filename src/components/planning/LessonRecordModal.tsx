"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Save, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";
import {
  optionsForMetric,
  type LessonMetricDefinition,
  type LessonMetricOption,
  type LessonRecordMetric,
  type LessonRecordStudent,
  type LessonStudentDraft
} from "@/lib/students/lesson-records";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];
type LessonRecord = Database["public"]["Tables"]["lesson_records"]["Row"];

export function LessonRecordModal({
  weeklyPlanItemId,
  activity,
  classItem,
  lessonDate,
  onClose,
  onSaved,
  onError
}: {
  weeklyPlanItemId: string;
  activity: Activity;
  classItem: ClassRow;
  lessonDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { supabase } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [definitions, setDefinitions] = useState<LessonMetricDefinition[]>([]);
  const [options, setOptions] = useState<LessonMetricOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LessonStudentDraft>>({});
  const [existingRecord, setExistingRecord] = useState<LessonRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const activeDefinitions = useMemo(
    () => definitions.filter((definition) => definition.is_active).sort((left, right) => left.sort_order - right.sort_order),
    [definitions]
  );
  const checklistColumns = activeDefinitions.length
    ? `190px repeat(${activeDefinitions.length}, minmax(230px, 1fr)) 240px`
    : "190px minmax(300px, 1fr)";

  useEffect(() => {
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem.id, weeklyPlanItemId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  async function loadForm() {
    setLoading(true);
    try {
      const [studentsResponse, definitionsResponse, optionsResponse, recordResponse] = await Promise.all([
        supabase.from("students").select("*").eq("class_id", classItem.id).eq("status", "active").order("name"),
        supabase.from("lesson_metric_definitions").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("lesson_metric_options").select("*").order("sort_order"),
        supabase.from("lesson_records").select("*").eq("weekly_plan_item_id", weeklyPlanItemId).maybeSingle()
      ]);

      if (studentsResponse.error) throw studentsResponse.error;
      if (definitionsResponse.error) throw definitionsResponse.error;
      if (optionsResponse.error) throw optionsResponse.error;
      if (recordResponse.error) throw recordResponse.error;

      const nextStudents = studentsResponse.data || [];
      const record = recordResponse.data || null;
      let recordStudents: LessonRecordStudent[] = [];
      let recordMetrics: LessonRecordMetric[] = [];

      if (record) {
        const recordStudentsResponse = await supabase
          .from("lesson_record_students")
          .select("*")
          .eq("lesson_record_id", record.id);
        if (recordStudentsResponse.error) throw recordStudentsResponse.error;
        recordStudents = recordStudentsResponse.data || [];

        const recordStudentIds = recordStudents.map((item) => item.id);
        if (recordStudentIds.length) {
          const metricsResponse = await supabase
            .from("lesson_record_metrics")
            .select("*")
            .in("lesson_record_student_id", recordStudentIds);
          if (metricsResponse.error) throw metricsResponse.error;
          recordMetrics = metricsResponse.data || [];
        }
      }

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
      setDefinitions(definitionsResponse.data || []);
      setOptions(optionsResponse.data || []);
      setExistingRecord(record);
      setDrafts(nextDrafts);
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
        metrics: {
          ...(current[studentId]?.metrics || {}),
          [metricId]: optionId
        }
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

  async function saveLessonRecord() {
    if (!students.length) {
      onError("Cadastre alunos nesta turma antes de registrar a aula.");
      return;
    }

    setBusy(true);
    try {
      await apiFetch(supabase, "/api/lesson-records", {
        method: "POST",
        body: {
          weekly_plan_item_id: weeklyPlanItemId,
          students: students.map((student) => {
            const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
            return {
              student_id: student.id,
              observation: draft.observation,
              metrics: Object.entries(draft.metrics).map(([metricId, optionId]) => ({
                metric_id: metricId,
                option_id: optionId
              }))
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
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ink/45 px-3 py-4 sm:px-5 sm:py-6" role="dialog" aria-modal="true" aria-labelledby="lesson-record-title">
      <div className="mx-auto w-full max-w-7xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <header className="sticky top-0 z-10 border-b border-ink/10 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label mb-1">Registro da aula</p>
              <h2 id="lesson-record-title" className="truncate text-xl font-bold text-ink sm:text-2xl">{activity.title}</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink/55">
                <span><strong className="text-ink">Turma:</strong> {classItem.name}{classItem.shift ? ` - ${classItem.shift}` : ""}</span>
                <span><strong className="text-ink">Data:</strong> {formatDate(lessonDate)}</span>
                <span><strong className="text-ink">Área:</strong> {activity.development_area || "Não informada"}</span>
                <span><strong className="text-ink">Metodologia:</strong> {activity.methodology || "Não informada"}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink disabled:opacity-50" title="Fechar" aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          {loading ? (
            <p className="py-16 text-center text-sm font-semibold text-ink/55">Carregando alunos e indicadores...</p>
          ) : students.length ? (
            <>
            <div className="space-y-3 lg:hidden">
              {students.map((student) => {
                const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
                return (
                  <article key={student.id} className="rounded-lg border border-ink/10 p-4">
                    <h3 className="font-bold text-ink">{student.name}</h3>
                    <div className="mt-4 space-y-4">
                      {activeDefinitions.map((definition) => (
                        <fieldset key={definition.id}>
                          <legend className="label mb-2">{definition.name}</legend>
                          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${definition.name} de ${student.name}`}>
                            {optionsForMetric(options, definition.id).map((option) => {
                              const active = draft.metrics[definition.id] === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => selectMetric(student.id, definition.id, option.id)}
                                  className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                    active ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/55"
                                  }`}
                                >
                                  {active ? <Check size={13} /> : null}
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      ))}
                      <label className="block">
                        <span className="label mb-2 block">Observação</span>
                        <input
                          value={draft.observation}
                          maxLength={1000}
                          onChange={(event) => updateObservation(student.id, event.target.value)}
                          className="input py-2 text-sm"
                          placeholder="Opcional"
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-ink/10 lg:block">
              <div className="min-w-[1120px] divide-y divide-ink/10">
                <div className="grid gap-3 bg-paper px-4 py-3" style={{ gridTemplateColumns: checklistColumns }}>
                  <span className="label">Aluno</span>
                  {activeDefinitions.map((definition) => <span key={definition.id} className="label">{definition.name}</span>)}
                  <span className="label">Observação</span>
                </div>

                {students.map((student) => {
                  const draft = drafts[student.id] || { student_id: student.id, observation: "", metrics: {} };
                  return (
                    <div key={student.id} className="grid items-center gap-3 px-4 py-3" style={{ gridTemplateColumns: checklistColumns }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{student.name}</p>
                      </div>
                      {activeDefinitions.map((definition) => (
                        <div key={definition.id} className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${definition.name} de ${student.name}`}>
                          {optionsForMetric(options, definition.id).map((option) => {
                            const active = draft.metrics[definition.id] === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => selectMetric(student.id, definition.id, option.id)}
                                className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                                  active ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/55 hover:border-leaf/35"
                                }`}
                              >
                                {active ? <Check size={12} /> : null}
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      <input
                        value={draft.observation}
                        maxLength={1000}
                        onChange={(event) => updateObservation(student.id, event.target.value)}
                        className="input py-2 text-sm"
                        placeholder="Opcional"
                        aria-label={`Observação sobre ${student.name}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-ink/55">Nenhum aluno ativo cadastrado nesta turma.</p>
            </div>
          )}
        </div>

        <footer className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-ink/10 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={() => void saveLessonRecord()} disabled={busy || loading || !students.length} className="btn-primary disabled:opacity-50">
            {existingRecord ? <Save size={16} /> : <ClipboardCheck size={16} />}
            {busy ? "Salvando..." : existingRecord ? "Atualizar registro" : "Salvar registro da aula"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
