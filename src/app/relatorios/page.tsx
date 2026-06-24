"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, RefreshCw, Sparkles, UsersRound } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ReportRow = Database["public"]["Tables"]["student_reports"]["Row"];

const reportCards = [
  { type: "Relatório individual", description: "Síntese pedagógica de um aluno.", color: "#00B3AF" },
  { type: "Relatório da turma", description: "Gere relatórios individuais para todos os alunos ativos.", color: "#2F80ED" },
  { type: "Parecer bimestral", description: "Texto avaliativo para fechamento de bimestre.", color: "#C98117" },
  { type: "Parecer semestral", description: "Síntese ampla do desenvolvimento no semestre.", color: "#FF4F64" },
  { type: "Devolutiva para família", description: "Comunicação acolhedora para responsáveis.", color: "#7E57C2" },
  { type: "Relatório para coordenação", description: "Registro objetivo para acompanhamento interno.", color: "#2f7d58" },
  { type: "Conselho de classe", description: "Apoio para reunião pedagógica.", color: "#D97706" }
];

const tones = ["Acolhedor", "Objetivo", "Formal", "Pedagógico"];
const periodOptions = [
  { value: "week", label: "Semana" },
  { value: "biweek", label: "Quinzena" },
  { value: "month", label: "Mês" },
  { value: "bimester", label: "Bimestre" },
  { value: "semester", label: "Semestre" },
  { value: "custom", label: "Personalizado" }
];

export default function ReportsPage() {
  const { supabase } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedType, setSelectedType] = useState(reportCards[0].type);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [periodKind, setPeriodKind] = useState("month");
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [tone, setTone] = useState("Acolhedor");
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resultReports, setResultReports] = useState<Array<{ student: StudentRow; report: ReportRow; cached: boolean }>>([]);

  const classStudents = useMemo(
    () => students.filter((student) => student.class_id === classId && student.status === "active"),
    [classId, students]
  );
  const selectedReportCard = reportCards.find((card) => card.type === selectedType) || reportCards[0];
  const isClassBatch = selectedType === "Relatório da turma";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const turma = params.get("turma");
    const aluno = params.get("aluno");
    if (turma) setClassId(turma);
    if (aluno) setStudentId(aluno);
  }, []);

  useEffect(() => {
    loadData().catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar relatórios."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!classId && classes[0]) setClassId(classes[0].id);
  }, [classId, classes]);

  useEffect(() => {
    if (periodKind !== "custom") {
      const range = resolvePeriod(periodKind);
      setPeriodStart(range.start);
      setPeriodEnd(range.end);
    }
  }, [periodKind]);

  useEffect(() => {
    if (dataLoaded && classId && studentId && !classStudents.some((student) => student.id === studentId)) {
      setStudentId("");
    }
  }, [classId, classStudents, dataLoaded, studentId]);

  async function loadData() {
    const [classesResponse, studentsResponse, reportsResponse] = await Promise.all([
      supabase.from("classes").select("*").order("created_at", { ascending: false }),
      supabase.from("students").select("*").order("name"),
      supabase.from("student_reports").select("*").order("generated_at", { ascending: false })
    ]);

    if (classesResponse.error) throw classesResponse.error;
    if (studentsResponse.error) throw studentsResponse.error;
    if (reportsResponse.error) throw reportsResponse.error;

    setClasses(classesResponse.data || []);
    setStudents(studentsResponse.data || []);
    setReports(reportsResponse.data || []);
    setDataLoaded(true);
  }

  async function generateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return setMessage("Selecione uma turma.");
    if (!isClassBatch && !studentId) return setMessage("Selecione um aluno.");

    setBusy(true);
    setMessage(null);
    setResultReports([]);
    try {
      const data = await apiFetch<{
        student?: StudentRow;
        report?: ReportRow;
        cached?: boolean;
        reports?: Array<{ student: StudentRow; report: ReportRow; cached: boolean }>;
      }>(supabase, "/api/student-reports/generate", {
        method: "POST",
        body: {
          mode: isClassBatch ? "class_batch" : "individual",
          class_id: classId,
          student_id: isClassBatch ? null : studentId,
          report_type: selectedType,
          period_start: periodStart,
          period_end: periodEnd,
          tone,
          force_regenerate: forceRegenerate
        }
      });

      const nextReports = data.reports || (data.student && data.report ? [{ student: data.student, report: data.report, cached: Boolean(data.cached) }] : []);
      setResultReports(nextReports);
      await loadData();
      setMessage(nextReports.some((item) => item.cached)
        ? "Relatório exibido a partir do cache salvo."
        : "Relatório gerado e salvo.");
      setForceRegenerate(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar relatório.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage
      title="Relatórios"
      subtitle="Gere sínteses pedagógicas com IA somente quando precisar, usando os registros que você salvou."
    >
      {message ? <p className="mb-4 rounded-lg border border-leaf/15 bg-mint px-4 py-3 text-sm font-semibold text-leaf">{message}</p> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reportCards.map((card) => (
              <button
                key={card.type}
                type="button"
                onClick={() => setSelectedType(card.type)}
                className={`rounded-lg border bg-white p-4 text-left shadow-soft transition ${selectedType === card.type ? "border-leaf" : "border-ink/10 hover:border-leaf/30"}`}
                style={{ borderTopWidth: 6, borderTopColor: card.color }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-ink">{card.type}</h2>
                    <p className="mt-2 text-sm leading-5 text-ink/60">{card.description}</p>
                  </div>
                  {card.type === "Relatório da turma" ? <UsersRound className="text-leaf" size={20} /> : <FileText className="text-leaf" size={20} />}
                </div>
              </button>
            ))}
          </div>

          <section className="panel p-5">
            <div className="mb-4">
              <p className="label">Fluxo de geração</p>
              <h2 className="mt-1 text-xl font-bold text-ink">{selectedType}</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Vamos montar uma síntese pedagógica com base nos registros que você salvou.
              </p>
            </div>

            <form onSubmit={generateReport} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Turma">
                  <select value={classId} onChange={(event) => setClassId(event.target.value)} className="input" required>
                    <option value="">Selecione</option>
                    {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
                  </select>
                </Field>

                {!isClassBatch ? (
                  <Field label="Aluno">
                    <select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="input" required>
                      <option value="">Selecione</option>
                      {classStudents.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                    </select>
                  </Field>
                ) : (
                  <div className="rounded-lg bg-paper p-3 text-sm leading-6 text-ink/65">
                    {classStudents.length} alunos ativos serão considerados.
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Período">
                  <select value={periodKind} onChange={(event) => setPeriodKind(event.target.value)} className="input">
                    {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Data inicial">
                  <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} disabled={periodKind !== "custom"} className="input disabled:opacity-70" />
                </Field>
                <Field label="Data final">
                  <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} disabled={periodKind !== "custom"} className="input disabled:opacity-70" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tom">
                  <select value={tone} onChange={(event) => setTone(event.target.value)} className="input">
                    {tones.map((toneOption) => <option key={toneOption} value={toneOption}>{toneOption}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white p-3 text-sm text-ink/70">
                  <input type="checkbox" checked={forceRegenerate} onChange={(event) => setForceRegenerate(event.target.checked)} />
                  Regenerar mesmo se já existir versão em cache
                </label>
              </div>

              <div className="rounded-lg bg-paper p-3 text-sm leading-6 text-ink/60">
                A IA não é chamada ao salvar observações ou abrir perfis. Ela só será usada ao gerar ou regenerar relatórios.
              </div>

              <button type="submit" disabled={busy || !classes.length} className="btn-primary disabled:opacity-60">
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                {isClassBatch ? "Gerar relatórios da turma" : "Gerar relatório"}
              </button>
            </form>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-5">
            <p className="label">Resultado</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{selectedReportCard.type}</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Relatório gerado a partir das observações registradas pela professora.
            </p>
          </section>

          {resultReports.length ? (
            <div className="space-y-3">
              {resultReports.map(({ student, report, cached }) => (
                <ReportCard key={report.id} student={student} report={report} cached={cached} />
              ))}
            </div>
          ) : (
            <section className="panel p-5 text-sm leading-6 text-ink/60">
              Selecione os dados e clique em gerar. Se já houver um relatório com o mesmo conjunto de observações, ele será exibido sem nova chamada de IA.
            </section>
          )}

          <section className="panel p-5">
            <h3 className="font-bold text-ink">Relatórios recentes</h3>
            <div className="mt-3 space-y-2">
              {reports.slice(0, 6).map((report) => {
                const student = students.find((item) => item.id === report.student_id);
                return (
                  <div key={report.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                    <p className="font-bold text-ink">{student?.name || "Turma"}</p>
                    <p className="mt-1 text-ink/55">{report.report_type} • {formatDate(report.generated_at.slice(0, 10))}</p>
                  </div>
                );
              })}
              {!reports.length ? <p className="text-sm text-ink/55">Nenhum relatório gerado ainda.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </ProtectedPage>
  );
}

function ReportCard({ student, report, cached }: { student: StudentRow; report: ReportRow; cached: boolean }) {
  return (
    <article className="panel overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-ink/10 p-4">
        <div>
          <p className="label">{cached ? "Cache salvo" : "Novo relatório"}</p>
          <h3 className="mt-1 text-lg font-bold text-ink">{student.name}</h3>
          <p className="mt-1 text-sm text-ink/55">{report.report_type} • {formatDate(report.generated_at.slice(0, 10))}</p>
        </div>
        {cached ? <RefreshCw size={18} className="text-leaf" /> : <FileText size={18} className="text-leaf" />}
      </div>
      <div className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-sm leading-7 text-ink/75">
        {report.content}
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function resolvePeriod(kind: string) {
  const end = new Date();
  const start = new Date(end);
  if (kind === "week") start.setDate(end.getDate() - 6);
  else if (kind === "biweek") start.setDate(end.getDate() - 13);
  else if (kind === "bimester") start.setMonth(end.getMonth() - 2);
  else if (kind === "semester") start.setMonth(end.getMonth() - 6);
  else start.setDate(1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}
