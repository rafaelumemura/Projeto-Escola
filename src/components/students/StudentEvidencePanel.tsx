"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Database } from "@/lib/database.types";
import type {
  LessonMetricDefinition,
  LessonMetricOption,
  LessonRecord,
  LessonRecordMetric,
  LessonRecordStudent
} from "@/lib/students/lesson-records";

type Student = Database["public"]["Tables"]["students"]["Row"];

export function StudentEvidencePanel({
  student,
  selectedYear,
  onMessage
}: {
  student: Student;
  selectedYear: number;
  onMessage: (message: string) => void;
}) {
  const { supabase } = useAuth();
  const [records, setRecords] = useState<LessonRecord[]>([]);
  const [recordStudents, setRecordStudents] = useState<LessonRecordStudent[]>([]);
  const [metrics, setMetrics] = useState<LessonRecordMetric[]>([]);
  const [definitions, setDefinitions] = useState<LessonMetricDefinition[]>([]);
  const [options, setOptions] = useState<LessonMetricOption[]>([]);
  const [loading, setLoading] = useState(true);

  const evidence = useMemo(() => records.map((record) => {
    const recordStudent = recordStudents.find((item) => item.lesson_record_id === record.id);
    const studentMetrics = recordStudent
      ? metrics.filter((metric) => metric.lesson_record_student_id === recordStudent.id)
      : [];
    return {
      record,
      recordStudent,
      indicators: studentMetrics.map((metric) => ({
        id: metric.id,
        name: definitions.find((definition) => definition.id === metric.metric_definition_id)?.name || "Indicador",
        value: options.find((option) => option.id === metric.metric_option_id)?.label || "Não informado"
      }))
    };
  }), [definitions, metrics, options, recordStudents, records]);

  useEffect(() => {
    void loadEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, student.id, supabase]);

  async function loadEvidence() {
    setLoading(true);
    try {
      const [allRecordStudentsResponse, definitionsResponse, optionsResponse] = await Promise.all([
        supabase.from("lesson_record_students").select("*").eq("student_id", student.id),
        supabase.from("lesson_metric_definitions").select("*").order("sort_order"),
        supabase.from("lesson_metric_options").select("*").order("sort_order")
      ]);
      if (allRecordStudentsResponse.error) throw allRecordStudentsResponse.error;
      if (definitionsResponse.error) throw definitionsResponse.error;
      if (optionsResponse.error) throw optionsResponse.error;

      const allRecordStudents = allRecordStudentsResponse.data || [];
      const lessonRecordIds = allRecordStudents.map((item) => item.lesson_record_id);
      const recordsResponse = lessonRecordIds.length
        ? await supabase
          .from("lesson_records")
          .select("*")
          .in("id", lessonRecordIds)
          .gte("lesson_date", `${selectedYear}-01-01`)
          .lte("lesson_date", `${selectedYear}-12-31`)
          .order("lesson_date", { ascending: false })
        : { data: [], error: null };
      if (recordsResponse.error) throw recordsResponse.error;

      const nextRecords = recordsResponse.data || [];
      const relevantRecordIds = new Set(nextRecords.map((record) => record.id));
      const nextRecordStudents = allRecordStudents.filter((item) => relevantRecordIds.has(item.lesson_record_id));
      const recordStudentIds = nextRecordStudents.map((item) => item.id);
      const metricsResponse = recordStudentIds.length
        ? await supabase.from("lesson_record_metrics").select("*").in("lesson_record_student_id", recordStudentIds)
        : { data: [], error: null };
      if (metricsResponse.error) throw metricsResponse.error;

      setRecords(nextRecords);
      setRecordStudents(nextRecordStudents);
      setMetrics(metricsResponse.data || []);
      setDefinitions(definitionsResponse.data || []);
      setOptions(optionsResponse.data || []);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Não foi possível carregar as evidências.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-ink/10 p-4">
        <p className="label">Histórico individual</p>
        <h3 className="mt-1 text-lg font-bold text-ink">Evidências</h3>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm font-semibold text-ink/55">Carregando evidências...</p>
      ) : evidence.length ? (
        <div className="divide-y divide-ink/10">
          {evidence.map(({ record, recordStudent, indicators }) => (
            <article key={record.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="font-bold text-ink">{record.activity_title}</h4>
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink/45">
                    <CalendarDays size={13} />
                    {formatDate(record.lesson_date)}
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold text-leaf">
                  <ClipboardCheck size={12} />
                  Aula registrada em Planejamento
                </span>
              </div>

              {indicators.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {indicators.map((indicator) => (
                    <div key={indicator.id} className="rounded-md border border-ink/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-ink/50">{indicator.name}: </span>
                      <strong className="text-ink">{indicator.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}

              {recordStudent?.observation ? (
                <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm leading-6 text-ink/65">
                  {recordStudent.observation}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center">
          <ClipboardCheck size={24} className="mx-auto text-ink/30" />
          <p className="mt-3 text-sm font-semibold text-ink/55">Nenhuma evidência recebida de aulas registradas em {selectedYear}.</p>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
