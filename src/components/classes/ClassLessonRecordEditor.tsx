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

export function ClassLessonRecordEditor({
  classItem,
  activities,
  initialActivityId,
  initialLessonDate,
  onSaved,
  onError
}: {
  classItem: ClassRow;
  activities: Activity[];
  initialActivityId?: string;
  initialLessonDate?: string;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { supabase, user } = useAuth();
  const lessonDate = initialLessonDate || localDateValue(new Date());
  const [selectedActivityId, setSelectedActivityId] = useState(
    activities.some((activity) => activity.id === initialActivityId) ? initialActivityId || "" : activities[0]?.id || ""
  );
  const [students, setStudents] = useState<Student[]>([]);
  const [definitions, setDefinitions] = useState<LessonMetricDefinition[]>([]);
  const [options, setOptions] = useState<LessonMetricOption[]>([]);
  const [presets, setPresets] = useState<LessonMetricPreset[]>([]);
  const [presetItems, setPresetItems] = useState<LessonMetricPresetItem[]>([]);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, LessonStudentDraft>>({});
  const [savedRecord, setSavedRecord] = useState(false);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [customCriterionOpen, setCustomCriterionOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customLevelCount, setCustomLevelCount] = useState(3);
  const [customLabels, setCustomLabels] = useState(defaultCustomLabels(3));

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
  const desktopColumns = `220px repeat(${Math.max(selectedDefinitions.length, 1)}, 190px) 64px`;
  const desktopTableWidth = 220 + (Math.max(selectedDefinitions.length, 1) * 190) + 64 + ((selectedDefinitions.length + 1) * 12) + 32;

  useEffect(() => {
    const nextActivityId = activities.some((item) => item.id === initialActivityId)
      ? initialActivityId || ""
      : activities[0]?.id || "";
    setSelectedActivityId(nextActivityId);
  }, [activities, initialActivityId]);

  useEffect(() => {
    void loadForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem.id, selectedActivityId]);

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
      setSavedRecord(Boolean(record));
      setDrafts(nextDrafts);
      setOpenComments(new Set(recordStudents.filter((item) => item.observation).map((item) => item.student_id)));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível carregar o registro da aula.");
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

  function changeCustomLevelCount(nextCount: number) {
    setCustomLevelCount(nextCount);
    setCustomLabels((current) => Array.from(
      { length: nextCount },
      (_, index) => current[index] || defaultCustomLabels(nextCount)[index]
    ));
  }

  async function createCustomCriterion() {
    if (!user) return;
    if (!customName.trim() || customLabels.some((label) => !label.trim())) {
      onError("Informe o nome do critério e a legenda de todos os níveis.");
      return;
    }

    setBusy(true);
    try {
      const { data: metricId, error } = await supabase.rpc("create_lesson_metric_definition", {
        p_name: customName.trim(),
        p_labels: customLabels.map((label) => label.trim())
      });
      if (error) throw error;

      const [definitionResponse, optionsResponse] = await Promise.all([
        supabase.from("lesson_metric_definitions").select("*").eq("id", metricId).single(),
        supabase.from("lesson_metric_options").select("*").eq("metric_definition_id", metricId).order("performance_level")
      ]);
      if (definitionResponse.error) throw definitionResponse.error;
      if (optionsResponse.error) throw optionsResponse.error;

      setDefinitions((current) => [...current, definitionResponse.data]);
      setOptions((current) => [...current, ...(optionsResponse.data || [])]);
      setSelectedMetricIds((current) => [...current, metricId]);
      setCustomName("");
      setCustomLevelCount(3);
      setCustomLabels(defaultCustomLabels(3));
      setCustomCriterionOpen(false);
      onSaved("Critério personalizado adicionado.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível criar o critério personalizado.");
    } finally {
      setBusy(false);
    }
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
      onSaved(savedRecord ? "Registro da aula atualizado." : "Aula registrada para todos os alunos.");
      setSavedRecord(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível salvar o registro da aula.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft" aria-labelledby="class-lesson-title">
        <header className="border-b border-ink/10 bg-white px-4 py-4 sm:px-6">
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
                  <div className="lg:max-w-xl">
                    <p className="label">Adicionar critério</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {availableDefinitions.map((definition) => (
                        <button key={definition.id} type="button" onClick={() => addCriterion(definition.id)} className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-bold text-ink/60 hover:border-leaf/35 hover:text-leaf">
                          <Plus size={13} />
                          {definition.name}
                        </button>
                      ))}
                      <button type="button" onClick={() => setCustomCriterionOpen((current) => !current)} className="inline-flex items-center gap-1 rounded-full border border-leaf/25 bg-white px-3 py-1.5 text-xs font-bold text-leaf hover:bg-mint">
                        <Plus size={13} />
                        Critério personalizado
                      </button>
                    </div>
                  </div>
                </div>

                {customCriterionOpen ? (
                  <div className="mt-4 rounded-lg border border-leaf/20 bg-white p-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_auto]">
                      <label className="block">
                        <span className="label mb-2 block">Nome do critério</span>
                        <input value={customName} maxLength={80} onChange={(event) => setCustomName(event.target.value)} className="input" placeholder="Ex.: Colaboração" />
                      </label>
                      <div>
                        <span className="label mb-2 block">Quantidade de níveis</span>
                        <div className="flex gap-2" role="group" aria-label="Quantidade de níveis">
                          {[2, 3, 4, 5].map((count) => (
                            <button key={count} type="button" onClick={() => changeCustomLevelCount(count)} className={`grid h-10 w-10 place-items-center rounded-md border text-sm font-bold ${customLevelCount === count ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/55"}`}>
                              {count}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {customLabels.map((label, index) => (
                        <label key={index} className="block">
                          <span className="mb-2 flex items-center gap-2 text-xs font-bold text-ink/55">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: customLevelColors(customLevelCount)[index] }} />
                            Legenda {index + 1}
                          </span>
                          <input
                            value={label}
                            maxLength={60}
                            onChange={(event) => setCustomLabels((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                            className="input py-2 text-sm"
                            placeholder={`Nível ${index + 1}`}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" onClick={() => setCustomCriterionOpen(false)} className="btn-secondary">Cancelar</button>
                      <button type="button" onClick={() => void createCustomCriterion()} disabled={busy} className="btn-primary">Adicionar critério</button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="hidden overflow-x-auto rounded-lg border border-ink/10 lg:block">
                <div style={{ minWidth: `${desktopTableWidth}px` }}>
                  <div className="grid gap-3 border-b border-ink/10 bg-paper px-4 py-4" style={{ gridTemplateColumns: desktopColumns }}>
                    <span className="label self-center">Aluno</span>
                    {selectedDefinitions.map((definition) => (
                      <span key={definition.id} className="label self-center text-center">{definition.name}</span>
                    ))}
                    <span className="label self-center text-center">Obs.</span>
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

              <section className="rounded-lg border border-ink/10 bg-paper/55 p-4 sm:p-5">
                <p className="label mb-4">Legendas dos critérios</p>
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedDefinitions.map((definition) => (
                    <MetricLegend key={definition.id} definition={definition} options={optionsForMetric(options, definition.id)} />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-ink/55">Nenhum aluno ativo cadastrado nesta turma.</p>
            </div>
          )}
        </div>

        <footer className="flex justify-end border-t border-ink/10 bg-white px-4 py-4 sm:px-6">
          <button type="button" onClick={() => void saveLessonRecord()} disabled={busy || loading || !students.length || !activity} className="btn-primary disabled:opacity-50">
            {savedRecord ? <Save size={16} /> : <ClipboardCheck size={16} />}
            {busy ? "Salvando..." : savedRecord ? "Atualizar registro" : "Salvar registro da aula"}
          </button>
        </footer>
    </section>
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

function MetricLegend({ definition, options }: { definition: LessonMetricDefinition; options: LessonMetricOption[] }) {
  return (
    <div>
      <p className="label">{definition.name}</p>
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option) => (
          <span key={option.id} className="inline-flex items-center gap-2 text-xs font-semibold text-ink/60" title={option.label}>
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
            <span>{option.label}</span>
          </span>
        ))}
      </div>
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


function defaultCustomLabels(count: number) {
  const labelsByCount: Record<number, string[]> = {
    2: ["Precisa de apoio", "Realiza com autonomia"],
    3: ["Precisa de apoio", "Em desenvolvimento", "Realiza com autonomia"],
    4: ["Precisa de apoio", "Abaixo do esperado", "Bom desempenho", "Excelente desempenho"],
    5: ["Precisa de apoio", "Abaixo do esperado", "Em desenvolvimento", "Bom desempenho", "Excelente desempenho"]
  };
  return labelsByCount[count] || labelsByCount[3];
}

function customLevelColors(count: number) {
  const colorsByCount: Record<number, string[]> = {
    2: ["#E45757", "#219653"],
    3: ["#E45757", "#F2C94C", "#219653"],
    4: ["#E45757", "#F2994A", "#6FCF97", "#219653"],
    5: ["#E45757", "#F2994A", "#F2C94C", "#6FCF97", "#219653"]
  };
  return colorsByCount[count] || colorsByCount[3];
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
