"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Edit3, Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UndoToast, useUndoableAction } from "@/components/ui/UndoToast";
import type { Database } from "@/lib/database.types";
import {
  assessmentTypeLabel,
  assessmentTypeOptions,
  deliveryStatusLabel,
  deliveryStatusOptions,
  participationLevelLabel,
  participationLevelOptions,
  type AssessmentCriterion,
  type StudentAssessment,
  type StudentAssessmentCriterion
} from "@/lib/students/assessments";

type Student = Database["public"]["Tables"]["students"]["Row"];

type AssessmentForm = {
  assessment_date: string;
  title: string;
  assessment_type: StudentAssessment["assessment_type"];
  description: string;
  score: string;
  max_score: string;
  delivery_status: StudentAssessment["delivery_status"] | "";
  participation_level: StudentAssessment["participation_level"] | "";
  comments: string;
  criterion_ids: string[];
};

const emptyForm = (): AssessmentForm => ({
  assessment_date: localDateInputValue(),
  title: "",
  assessment_type: "evaluative_activity",
  description: "",
  score: "",
  max_score: "",
  delivery_status: "",
  participation_level: "",
  comments: "",
  criterion_ids: []
});

export function StudentAssessmentsPanel({
  student,
  selectedYear,
  onMessage
}: {
  student: Student;
  selectedYear: number;
  onMessage: (message: string) => void;
}) {
  const { supabase, user } = useAuth();
  const [assessments, setAssessments] = useState<StudentAssessment[]>([]);
  const [criteria, setCriteria] = useState<AssessmentCriterion[]>([]);
  const [criterionLinks, setCriterionLinks] = useState<StudentAssessmentCriterion[]>([]);
  const [editing, setEditing] = useState<StudentAssessment | null>(null);
  const [form, setForm] = useState<AssessmentForm>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const { pendingAction, schedule: scheduleDeletion, undo: undoDeletion } = useUndoableAction();

  const criteriaByAssessment = useMemo(() => {
    const result = new Map<string, AssessmentCriterion[]>();
    for (const link of criterionLinks) {
      const criterion = criteria.find((item) => item.id === link.criterion_id);
      if (!criterion) continue;
      result.set(link.assessment_id, [...(result.get(link.assessment_id) || []), criterion]);
    }
    return result;
  }, [criteria, criterionLinks]);

  useEffect(() => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
    void loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, student.id, supabase]);

  useEffect(() => {
    if (!modalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeModal();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  async function loadAssessments() {
    setLoading(true);
    try {
      const start = `${selectedYear}-01-01`;
      const end = `${selectedYear}-12-31`;
      const [assessmentsResponse, criteriaResponse] = await Promise.all([
        supabase
          .from("student_assessments")
          .select("*")
          .eq("student_id", student.id)
          .gte("assessment_date", start)
          .lte("assessment_date", end)
          .order("assessment_date", { ascending: false }),
        supabase
          .from("assessment_criteria")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .order("name")
      ]);

      if (assessmentsResponse.error) throw assessmentsResponse.error;
      if (criteriaResponse.error) throw criteriaResponse.error;

      const nextAssessments = assessmentsResponse.data || [];
      const assessmentIds = nextAssessments.map((assessment) => assessment.id);
      const linksResponse = assessmentIds.length
        ? await supabase.from("student_assessment_criteria").select("*").in("assessment_id", assessmentIds)
        : { data: [], error: null };
      if (linksResponse.error) throw linksResponse.error;

      setAssessments(nextAssessments);
      setCriteria(criteriaResponse.data || []);
      setCriterionLinks(linksResponse.data || []);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Não foi possível carregar as avaliações.");
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEditModal(assessment: StudentAssessment) {
    setEditing(assessment);
    setForm({
      assessment_date: assessment.assessment_date,
      title: assessment.title || "",
      assessment_type: assessment.assessment_type,
      description: assessment.description || "",
      score: assessment.score === null ? "" : String(assessment.score).replace(".", ","),
      max_score: assessment.max_score === null ? "" : String(assessment.max_score).replace(".", ","),
      delivery_status: assessment.delivery_status || "",
      participation_level: assessment.participation_level || "",
      comments: assessment.comments || "",
      criterion_ids: (criteriaByAssessment.get(assessment.id) || []).map((criterion) => criterion.id)
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function toggleCriterion(criterionId: string) {
    setForm((current) => ({
      ...current,
      criterion_ids: current.criterion_ids.includes(criterionId)
        ? current.criterion_ids.filter((id) => id !== criterionId)
        : [...current.criterion_ids, criterionId]
    }));
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const score = parseOptionalNumber(form.score);
    const maxScore = parseOptionalNumber(form.max_score);
    if (form.score.trim() && score === null) return onMessage("Informe uma nota obtida válida.");
    if (form.max_score.trim() && maxScore === null) return onMessage("Informe uma nota máxima válida.");
    if (score !== null && score < 0) return onMessage("A nota obtida não pode ser negativa.");
    if (maxScore !== null && maxScore <= 0) return onMessage("A nota máxima deve ser maior que zero.");
    if (score !== null && maxScore !== null && score > maxScore) return onMessage("A nota obtida não pode ser maior que a nota máxima.");

    setBusy(true);
    try {
      const payload = {
        student_id: student.id,
        class_id: student.class_id,
        assessment_date: form.assessment_date,
        title: form.title.trim() || null,
        assessment_type: form.assessment_type,
        description: form.description.trim() || null,
        score,
        max_score: maxScore,
        delivery_status: form.delivery_status || null,
        participation_level: form.participation_level || null,
        comments: form.comments.trim() || null
      };

      let assessmentId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("student_assessments")
          .update(payload)
          .eq("id", editing.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("student_assessments")
          .insert({ ...payload, user_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        assessmentId = data.id;
      }

      if (!assessmentId) throw new Error("Não foi possível identificar a avaliação salva.");

      const { error: deleteLinksError } = await supabase
        .from("student_assessment_criteria")
        .delete()
        .eq("assessment_id", assessmentId);
      if (deleteLinksError) throw deleteLinksError;

      if (form.criterion_ids.length) {
        const { error: linksError } = await supabase.from("student_assessment_criteria").insert(
          form.criterion_ids.map((criterionId) => ({ assessment_id: assessmentId as string, criterion_id: criterionId }))
        );
        if (linksError) throw linksError;
      }

      await loadAssessments();
      closeModal();
      onMessage(editing ? "Avaliação atualizada." : "Avaliação registrada.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Não foi possível salvar a avaliação.");
    } finally {
      setBusy(false);
    }
  }

  function deleteAssessment(assessment: StudentAssessment) {
    const assessmentsSnapshot = assessments;
    const linksSnapshot = criterionLinks;
    setAssessments((current) => current.filter((item) => item.id !== assessment.id));
    setCriterionLinks((current) => current.filter((link) => link.assessment_id !== assessment.id));
    scheduleDeletion({
      message: "Avaliação excluída.",
      commit: async () => {
        const { error } = await supabase.from("student_assessments").delete().eq("id", assessment.id);
        if (error) throw error;
      },
      undo: () => {
        setAssessments(assessmentsSnapshot);
        setCriterionLinks(linksSnapshot);
      },
      onError: (error) => onMessage(error instanceof Error ? error.message : "Não foi possível excluir a avaliação.")
    });
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label">Histórico individual</p>
          <h3 className="mt-1 text-lg font-bold text-ink">Avaliações</h3>
        </div>
        <button type="button" onClick={openCreateModal} className="btn-primary">
          <Plus size={16} />
          Nova avaliação
        </button>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm font-semibold text-ink/55">Carregando avaliações...</p>
      ) : assessments.length ? (
        <div className="divide-y divide-ink/10">
          {assessments.map((assessment) => {
            const linkedCriteria = criteriaByAssessment.get(assessment.id) || [];
            const scoreRatio = assessment.score !== null && assessment.max_score
              ? Math.min(100, Math.round((assessment.score / assessment.max_score) * 100))
              : null;
            const indicatorClass = scoreRatio === null
              ? "bg-ink/25"
              : scoreRatio >= 70
                ? "bg-emerald-500"
                : scoreRatio >= 50
                  ? "bg-amber-500"
                  : "bg-[#FF4F64]";

            return (
              <article key={assessment.id} className="relative p-4 pl-6">
                <span className={`absolute inset-y-4 left-3 w-1 rounded-full ${indicatorClass}`} aria-hidden="true" />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-ink">{assessment.title || assessmentTypeLabel(assessment.assessment_type)}</h4>
                      <span className="rounded-full bg-paper px-2 py-1 text-[11px] font-bold text-ink/55">
                        {assessmentTypeLabel(assessment.assessment_type)}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink/45">
                      <CalendarDays size={13} />
                      {formatDate(assessment.assessment_date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => openEditModal(assessment)} className="btn-secondary px-3 py-2 text-xs">
                      <Edit3 size={14} />
                      Editar
                    </button>
                    <button type="button" onClick={() => deleteAssessment(assessment)} className="btn-danger px-3 py-2 text-xs">
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/65">
                  {assessment.score !== null ? (
                    <span><strong className="text-ink">Nota:</strong> {formatScore(assessment.score)}{assessment.max_score !== null ? ` / ${formatScore(assessment.max_score)}` : ""}</span>
                  ) : null}
                  {deliveryStatusLabel(assessment.delivery_status) ? (
                    <span><strong className="text-ink">Entrega:</strong> {deliveryStatusLabel(assessment.delivery_status)}</span>
                  ) : null}
                  {participationLevelLabel(assessment.participation_level) ? (
                    <span><strong className="text-ink">Participação:</strong> {participationLevelLabel(assessment.participation_level)}</span>
                  ) : null}
                </div>

                {assessment.description ? <p className="mt-3 text-sm leading-6 text-ink/65">{assessment.description}</p> : null}
                {linkedCriteria.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {linkedCriteria.map((criterion) => (
                      <span key={criterion.id} className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-semibold text-leaf">
                        {criterion.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {assessment.comments ? <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm leading-6 text-ink/65">{assessment.comments}</p> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-ink/55">Nenhuma avaliação registrada para este aluno em {selectedYear}.</p>
          <button type="button" onClick={openCreateModal} className="mt-4 btn-primary">
            <Plus size={16} />
            Adicionar primeira avaliação
          </button>
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="assessment-modal-title">
          <form onSubmit={saveAssessment} className="w-full max-w-3xl rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">Avaliações</p>
                <h2 id="assessment-modal-title" className="text-xl font-bold text-ink">{editing ? "Editar avaliação" : "Nova avaliação"}</h2>
              </div>
              <button type="button" onClick={closeModal} disabled={busy} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink disabled:opacity-50" title="Fechar" aria-label="Fechar">
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data" required>
                <input required type="date" value={form.assessment_date} onChange={(event) => setForm((current) => ({ ...current, assessment_date: event.target.value }))} className="input" />
              </Field>
              <Field label="Tipo" required>
                <select required value={form.assessment_type} onChange={(event) => setForm((current) => ({ ...current, assessment_type: event.target.value as StudentAssessment["assessment_type"] }))} className="input">
                  {assessmentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-4 grid gap-4">
              <Field label="Título">
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="input" placeholder="Opcional" />
              </Field>
              <Field label="Descrição">
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="input min-h-20" placeholder="Opcional" />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nota obtida">
                <input inputMode="decimal" value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} className="input" placeholder="Ex.: 8,5" />
              </Field>
              <Field label="Nota máxima">
                <input inputMode="decimal" value={form.max_score} onChange={(event) => setForm((current) => ({ ...current, max_score: event.target.value }))} className="input" placeholder="Ex.: 10" />
              </Field>
              <Field label="Entrega">
                <select value={form.delivery_status} onChange={(event) => setForm((current) => ({ ...current, delivery_status: event.target.value as AssessmentForm["delivery_status"] }))} className="input">
                  <option value="">Não informado</option>
                  {deliveryStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Participação">
                <select value={form.participation_level} onChange={(event) => setForm((current) => ({ ...current, participation_level: event.target.value as AssessmentForm["participation_level"] }))} className="input">
                  <option value="">Não informado</option>
                  {participationLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <fieldset className="mt-4">
              <legend className="label">Critérios avaliados</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {criteria.map((criterion) => {
                  const active = form.criterion_ids.includes(criterion.id);
                  return (
                    <button
                      key={criterion.id}
                      type="button"
                      onClick={() => toggleCriterion(criterion.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/60"}`}
                      aria-pressed={active}
                    >
                      {active ? <Check size={13} /> : null}
                      {criterion.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4">
              <Field label="Comentários">
                <textarea value={form.comments} onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))} className="input min-h-24" placeholder="Opcional" />
              </Field>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeModal} disabled={busy} className="btn-secondary">Cancelar</button>
              <button disabled={busy} className="btn-primary">
                <Save size={16} />
                {busy ? "Salvando..." : "Salvar avaliação"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <UndoToast action={pendingAction} onUndo={undoDeletion} />
    </section>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-2 block">{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScore(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function localDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
