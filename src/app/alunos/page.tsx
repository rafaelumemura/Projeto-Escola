"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Check, Edit3, FileText, Plus, Save, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Database } from "@/lib/database.types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ObservationRow = Database["public"]["Tables"]["student_observations"]["Row"];
type ObservationStudentRow = Database["public"]["Tables"]["observation_students"]["Row"];
type StudentReportRow = Database["public"]["Tables"]["student_reports"]["Row"];
type ModalMode = "class" | "student" | "observation" | null;

const observationTypes = [
  { value: "individual", label: "Individual" },
  { value: "activity", label: "Atividade" },
  { value: "class", label: "Turma" },
  { value: "weekly", label: "Semana" },
  { value: "biweekly", label: "Quinzena" },
  { value: "free", label: "Livre" }
] as const;

const appliesToOptions = [
  { value: "all_class", label: "Toda a turma" },
  { value: "selected_students", label: "Alguns alunos" },
  { value: "individual_student", label: "Aluno específico" }
] as const;

const pedagogicalTags = [
  "Participação",
  "Autonomia",
  "Socialização",
  "Linguagem",
  "Coordenação motora",
  "Atenção",
  "Criatividade",
  "Raciocínio lógico",
  "Interação",
  "Organização",
  "Comunicação",
  "Desenvolvimento emocional"
];

const today = new Date().toISOString().slice(0, 10);

export default function StudentsPage() {
  const { supabase, user } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [links, setLinks] = useState<ObservationStudentRow[]>([]);
  const [reports, setReports] = useState<StudentReportRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [editingClass, setEditingClass] = useState<ClassRow | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [confirmDeleteClassId, setConfirmDeleteClassId] = useState<string | null>(null);

  const [classForm, setClassForm] = useState({ name: "", shift: "", school_year: "", description: "" });
  const [studentForm, setStudentForm] = useState({ name: "", birth_date: "", general_notes: "" });
  const [observationForm, setObservationForm] = useState({
    observation_type: "class" as ObservationRow["observation_type"],
    applies_to: "all_class" as ObservationRow["applies_to"],
    date: today,
    period_start: "",
    period_end: "",
    title: "",
    content: "",
    tags: [] as string[],
    student_ids: [] as string[]
  });

  const years = useMemo(
    () => buildYearOptions([
      ...classes.map((item) => item.created_at),
      ...classes.map((item) => item.school_year),
      ...students.map((item) => item.created_at),
      ...observations.map((item) => item.date),
      ...reports.map((item) => item.generated_at)
    ]),
    [classes, observations, reports, students]
  );
  const filteredClassIds = useMemo(() => {
    const ids = new Set<string>();
    for (const classItem of classes) {
      if (recordYear(classItem.created_at) === selectedYear || classItem.school_year?.includes(String(selectedYear))) {
        ids.add(classItem.id);
      }
    }
    for (const student of students) {
      if (recordYear(student.created_at) === selectedYear) ids.add(student.class_id);
    }
    for (const observation of observations) {
      if (recordYear(observation.date) === selectedYear) ids.add(observation.class_id);
    }
    for (const report of reports) {
      if (recordYear(report.generated_at) === selectedYear) ids.add(report.class_id);
    }
    return ids;
  }, [classes, observations, reports, selectedYear, students]);
  const filteredClasses = useMemo(
    () => classes.filter((classItem) => filteredClassIds.has(classItem.id)),
    [classes, filteredClassIds]
  );
  const selectedClass = filteredClasses.find((classItem) => classItem.id === selectedClassId) || null;
  const classStudents = useMemo(
    () => students.filter((student) => student.class_id === selectedClassId && student.status === "active").sort((a, b) => a.name.localeCompare(b.name)),
    [selectedClassId, students]
  );
  const activeClassStudents = classStudents;
  const classObservations = useMemo(
    () => observations.filter((observation) => observation.class_id === selectedClassId && recordYear(observation.date) === selectedYear),
    [observations, selectedClassId, selectedYear]
  );
  const selectedStudentObservationIds = new Set(
    links.filter((link) => link.student_id === selectedStudent?.id).map((link) => link.observation_id)
  );
  const selectedStudentObservations = observations.filter((observation) =>
    observation.class_id === selectedStudent?.class_id &&
    recordYear(observation.date) === selectedYear &&
    (observation.applies_to === "all_class" || selectedStudentObservationIds.has(observation.id))
  );
  const selectedStudentReports = reports.filter((report) => report.student_id === selectedStudent?.id && recordYear(report.generated_at) === selectedYear);

  useEffect(() => {
    loadAll().catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar alunos."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!years.includes(selectedYear)) setSelectedYear(years[0] || new Date().getFullYear());
  }, [selectedYear, years]);

  useEffect(() => {
    if (!filteredClasses.length) {
      setSelectedClassId("");
      setSelectedStudent(null);
      return;
    }
    if (!selectedClassId || !filteredClasses.some((classItem) => classItem.id === selectedClassId)) {
      setSelectedClassId(filteredClasses[0].id);
      setSelectedStudent(null);
    }
  }, [filteredClasses, selectedClassId]);

  async function loadAll() {
    const [classesResponse, studentsResponse, observationsResponse, reportsResponse] = await Promise.all([
      supabase.from("classes").select("*").order("created_at", { ascending: false }),
      supabase.from("students").select("*").order("name"),
      supabase.from("student_observations").select("*").order("date", { ascending: false }),
      supabase.from("student_reports").select("*").order("generated_at", { ascending: false })
    ]);

    if (classesResponse.error) throw classesResponse.error;
    if (studentsResponse.error) throw studentsResponse.error;
    if (observationsResponse.error) throw observationsResponse.error;
    if (reportsResponse.error) throw reportsResponse.error;

    const observationIds = (observationsResponse.data || []).map((observation) => observation.id);
    const linksResponse = observationIds.length
      ? await supabase.from("observation_students").select("*").in("observation_id", observationIds)
      : { data: [], error: null };
    if (linksResponse.error) throw linksResponse.error;

    setClasses(classesResponse.data || []);
    setStudents(studentsResponse.data || []);
    setObservations(observationsResponse.data || []);
    setReports(reportsResponse.data || []);
    setLinks(linksResponse.data || []);
  }

  function openClassModal(classItem?: ClassRow) {
    setEditingClass(classItem || null);
    setClassForm({
      name: classItem?.name || "",
      shift: classItem?.shift || "",
      school_year: classItem?.school_year || "",
      description: classItem?.description || ""
    });
    setModal("class");
  }

  function openStudentModal(student?: StudentRow) {
    if (!selectedClassId && !student) {
      setMessage("Crie ou selecione uma turma antes de adicionar alunos.");
      return;
    }

    setEditingStudent(student || null);
    setStudentForm({
      name: student?.name || "",
      birth_date: student?.birth_date || "",
      general_notes: student?.general_notes || ""
    });
    setModal("student");
  }

  function openObservationModal(student?: StudentRow) {
    if (!selectedClassId && !student?.class_id) {
      setMessage("Selecione uma turma antes de adicionar observações.");
      return;
    }

    const classId = student?.class_id || selectedClassId;
    setSelectedClassId(classId);
    setObservationForm({
      observation_type: student ? "individual" : "class",
      applies_to: student ? "individual_student" : "all_class",
      date: today,
      period_start: "",
      period_end: "",
      title: "",
      content: "",
      tags: [],
      student_ids: student ? [student.id] : studentIdsForClass(classId, students)
    });
    setModal("observation");
  }

  function closeModal() {
    setModal(null);
    setEditingClass(null);
    setEditingStudent(null);
    setBusy(false);
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        name: classForm.name.trim(),
        shift: classForm.shift.trim() || null,
        school_year: classForm.school_year.trim() || null,
        description: classForm.description.trim() || null
      };

      if (editingClass) {
        const { data, error } = await supabase.from("classes").update(payload).eq("id", editingClass.id).select("*").single();
        if (error) throw error;
        setSelectedClassId(data.id);
        setMessage("Turma atualizada.");
      } else {
        const { data, error } = await supabase.from("classes").insert({ ...payload, user_id: user.id }).select("*").single();
        if (error) throw error;
        setSelectedClassId(data.id);
        setSelectedYear(recordYear(data.created_at) || new Date().getFullYear());
        setMessage("Turma criada.");
      }
      await loadAll();
      closeModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a turma.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteClass(classId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("classes").delete().eq("id", classId);
      if (error) throw error;
      setConfirmDeleteClassId(null);
      setSelectedClassId((current) => (current === classId ? "" : current));
      setSelectedStudent(null);
      await loadAll();
      setMessage("Turma excluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir a turma.");
    } finally {
      setBusy(false);
    }
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        class_id: editingStudent?.class_id || selectedClassId,
        name: studentForm.name.trim(),
        birth_date: studentForm.birth_date || null,
        general_notes: studentForm.general_notes.trim() || null,
        status: "active" as const
      };

      if (editingStudent) {
        const { data, error } = await supabase.from("students").update(payload).eq("id", editingStudent.id).select("*").single();
        if (error) throw error;
        setSelectedStudent(data);
        setMessage("Aluno atualizado.");
      } else {
        const { data, error } = await supabase.from("students").insert({ ...payload, user_id: user.id }).select("*").single();
        if (error) throw error;
        setSelectedStudent(data);
        setMessage("Aluno cadastrado.");
      }
      await loadAll();
      closeModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o aluno.");
    } finally {
      setBusy(false);
    }
  }

  async function saveObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const classId = selectedClassId;
      const selectedStudentIds = observationForm.applies_to === "all_class"
        ? studentIdsForClass(classId, students)
        : shouldAttachStudents(observationForm.applies_to)
        ? observationForm.student_ids
        : [];

      if (observationForm.applies_to !== "all_class" && shouldAttachStudents(observationForm.applies_to) && selectedStudentIds.length === 0) {
        throw new Error("Selecione ao menos um aluno relacionado.");
      }

      const { data, error } = await supabase
        .from("student_observations")
        .insert({
          user_id: user.id,
          class_id: classId,
          observation_type: observationForm.observation_type,
          applies_to: observationForm.applies_to,
          date: observationForm.date,
          period_start: observationForm.period_start || null,
          period_end: observationForm.period_end || null,
          title: observationForm.title.trim() || null,
          content: observationForm.content.trim(),
          tags: observationForm.tags
        })
        .select("*")
        .single();

      if (error) throw error;

      if (selectedStudentIds.length) {
        const { error: linkError } = await supabase.from("observation_students").insert(
          selectedStudentIds.map((studentId) => ({
            observation_id: data.id,
            student_id: studentId
          }))
        );
        if (linkError) throw linkError;
      }

      await loadAll();
      closeModal();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a observação.");
    } finally {
      setBusy(false);
    }
  }

  function toggleObservationStudent(studentId: string) {
    setObservationForm((current) => ({
      ...current,
      student_ids: current.student_ids.includes(studentId)
        ? current.student_ids.filter((id) => id !== studentId)
        : current.applies_to === "individual_student"
          ? [studentId]
          : [...current.student_ids, studentId]
    }));
  }

  function toggleTag(tag: string) {
    setObservationForm((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((item) => item !== tag) : [...current.tags, tag]
    }));
  }

  return (
    <ProtectedPage
      title="Alunos"
      subtitle="Organize suas turmas, acompanhe seus alunos e registre observações do seu jeito."
      actions={
        <button type="button" onClick={() => openClassModal()} className="btn-primary">
          <Plus size={17} />
          Criar turma
        </button>
      }
    >
      {message ? (
        <div className="fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-leaf/15 bg-white px-4 py-3 text-sm font-semibold text-leaf shadow-soft">
          {message}
        </div>
      ) : null}

      <YearFilter years={years} selectedYear={selectedYear} onChange={setSelectedYear} />

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {filteredClasses.map((classItem) => {
              const classCount = students.filter((student) => student.class_id === classItem.id && student.status === "active").length;
              const active = classItem.id === selectedClassId;

              return (
                <article
                  key={classItem.id}
                  className={`rounded-lg border bg-white px-3 py-2.5 shadow-soft transition ${active ? "border-leaf" : "border-ink/10 hover:border-leaf/30"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setSelectedClassId(classItem.id)} className="min-w-0 flex-1 text-left">
                      <h2 className="truncate text-base font-bold text-ink">{classItem.name}</h2>
                      <p className="mt-0.5 truncate text-xs font-semibold text-ink/55">
                        {classItem.shift || "Turno não informado"} • {classCount} {classCount === 1 ? "aluno" : "alunos"}
                      </p>
                    </button>
                    {confirmDeleteClassId === classItem.id ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => deleteClass(classItem.id)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-leaf/25 bg-mint text-leaf transition hover:bg-mint/80"
                          disabled={busy}
                          title="Confirmar exclusão"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClassId(null)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-clay/25 bg-clay/10 text-clay transition hover:bg-clay/15"
                          disabled={busy}
                          title="Cancelar exclusão"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => openClassModal(classItem)} className="grid h-8 w-8 place-items-center rounded-md border border-ink/10 text-ink/60 transition hover:border-leaf/40 hover:text-leaf" title="Editar turma">
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteClassId(classItem.id)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-clay/25 bg-clay/10 text-clay transition hover:bg-clay/15"
                          disabled={busy}
                          title="Excluir turma"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!filteredClasses.length ? (
            <div className="panel p-5 text-sm leading-6 text-ink/65">
              Nenhuma turma ou aluno encontrado em {selectedYear}.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {selectedClass ? (
            <>
              <section className="panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="label">Turma selecionada</p>
                    <h2 className="mt-1 text-2xl font-bold text-ink">
                      {selectedClass.name}{selectedClass.shift ? ` - ${selectedClass.shift}` : ""}
                    </h2>
                    <p className="mt-1 text-sm text-ink/60">{selectedClass.description || "Sem descrição."}</p>
                  </div>
                  <button type="button" onClick={() => openStudentModal()} className="btn-primary">
                    <UserPlus size={17} />
                    Adicionar aluno
                  </button>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="panel overflow-hidden">
                  <div className="border-b border-ink/10 p-4">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                      <UsersRound size={19} className="text-leaf" />
                      Alunos
                    </h3>
                  </div>
                  <div className="divide-y divide-ink/10">
                    {classStudents.map((student) => (
                      <div key={student.id} className={`p-4 ${selectedStudent?.id === student.id ? "bg-mint/45" : ""}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <button type="button" onClick={() => setSelectedStudent(student)} className="min-w-0 text-left">
                            <h4 className="font-bold text-ink">{student.name}</h4>
                            <p className="mt-1 text-sm text-ink/55">
                              {student.birth_date ? `Nascimento: ${formatDate(student.birth_date)}` : "Nascimento não informado"}
                            </p>
                          </button>
                          <div className="flex shrink-0 flex-nowrap gap-2 overflow-x-auto">
                            <button type="button" onClick={() => openStudentModal(student)} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/60 transition hover:border-leaf/40 hover:text-leaf" title="Editar aluno">
                              <Edit3 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {!classStudents.length ? (
                      <p className="p-5 text-sm leading-6 text-ink/60">Nenhum aluno cadastrado nessa turma ainda.</p>
                    ) : null}
                  </div>
                </div>

                <StudentProfile
                  student={selectedStudent}
                  observations={selectedStudentObservations}
                  reports={selectedStudentReports}
                  classId={selectedClassId}
                  onAddObservation={openObservationModal}
                />
              </section>

              <section className="panel overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                    <CalendarDays size={19} className="text-leaf" />
                    Histórico de observações da turma
                  </h3>
                  <button type="button" onClick={() => openObservationModal()} className="btn-secondary">
                    <Plus size={16} />
                    Adicionar observação
                  </button>
                </div>
                <ObservationList observations={classObservations} links={links} students={students} classStudents={classStudents} />
              </section>
            </>
          ) : (
            <div className="panel p-6 text-sm leading-6 text-ink/65">Selecione ou crie uma turma para continuar.</div>
          )}
        </div>
      </section>

      {modal === "class" ? (
        <Modal title={editingClass ? "Editar turma" : "Criar turma"} onClose={closeModal}>
          <form onSubmit={saveClass} className="space-y-4">
            <Field label="Nome da turma">
              <input required value={classForm.name} onChange={(event) => setClassForm((current) => ({ ...current, name: event.target.value }))} className="input" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Período/turno">
                <select value={classForm.shift} onChange={(event) => setClassForm((current) => ({ ...current, shift: event.target.value }))} className="input">
                  <option value="">Selecione</option>
                  <option value="Manhã">Manhã</option>
                  <option value="Tarde">Tarde</option>
                  <option value="Noite">Noite</option>
                  <option value="Integral">Integral</option>
                </select>
              </Field>
              <Field label="Ano/série">
                <input value={classForm.school_year} onChange={(event) => setClassForm((current) => ({ ...current, school_year: event.target.value }))} className="input" placeholder="Infantil 4" />
              </Field>
            </div>
            <Field label="Descrição">
              <textarea value={classForm.description} onChange={(event) => setClassForm((current) => ({ ...current, description: event.target.value }))} className="input min-h-24" />
            </Field>
            <ModalActions busy={busy} onCancel={closeModal} />
          </form>
        </Modal>
      ) : null}

      {modal === "student" ? (
        <Modal title={editingStudent ? "Editar aluno" : "Adicionar aluno"} onClose={closeModal}>
          <form onSubmit={saveStudent} className="space-y-4">
            <Field label="Nome">
              <input required value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} className="input" />
            </Field>
            <div>
              <Field label="Data de nascimento">
                <input type="date" max={today} value={studentForm.birth_date} onChange={(event) => setStudentForm((current) => ({ ...current, birth_date: event.target.value }))} className="input" />
              </Field>
            </div>
            <Field label="Observação geral">
              <textarea value={studentForm.general_notes} onChange={(event) => setStudentForm((current) => ({ ...current, general_notes: event.target.value }))} className="input min-h-24" />
            </Field>
            <ModalActions busy={busy} onCancel={closeModal} />
          </form>
        </Modal>
      ) : null}

      {modal === "observation" ? (
        <Modal title="Adicionar observação" onClose={closeModal}>
          <form onSubmit={saveObservation} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo">
                <select value={observationForm.observation_type} onChange={(event) => setObservationForm((current) => ({ ...current, observation_type: event.target.value as ObservationRow["observation_type"] }))} className="input">
                  {observationTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </Field>
              <Field label="Refere-se a">
                <select
                  value={observationForm.applies_to}
                  onChange={(event) => {
                    const appliesTo = event.target.value as ObservationRow["applies_to"];
                    setObservationForm((current) => ({
                      ...current,
                      applies_to: appliesTo,
                      student_ids: appliesTo === "all_class" ? studentIdsForClass(selectedClassId, students) : []
                    }));
                  }}
                  className="input"
                >
                  {appliesToOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>
            <div>
              <Field label="Data">
                <input type="date" value={observationForm.date} onChange={(event) => setObservationForm((current) => ({ ...current, date: event.target.value }))} className="input" />
              </Field>
            </div>
            <Field label="Título opcional">
              <input value={observationForm.title} onChange={(event) => setObservationForm((current) => ({ ...current, title: event.target.value }))} className="input" />
            </Field>
            {observationForm.applies_to !== "none" ? (
              <Field label="Alunos relacionados">
                <div className="grid max-h-44 gap-2 overflow-auto rounded-lg border border-ink/10 p-2 sm:grid-cols-2">
                  {activeClassStudents.map((student) => (
                    <label key={student.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-ink/75 hover:bg-mint/50">
                      <input
                        type="checkbox"
                        checked={observationForm.applies_to === "all_class" || observationForm.student_ids.includes(student.id)}
                        disabled={observationForm.applies_to === "all_class"}
                        onChange={() => toggleObservationStudent(student.id)}
                      />
                      {student.name}
                    </label>
                  ))}
                  {!activeClassStudents.length ? <p className="px-2 py-2 text-sm text-ink/55">Nenhum aluno cadastrado nessa turma.</p> : null}
                </div>
              </Field>
            ) : null}
            <Field label="Observação">
              <textarea
                required
                value={observationForm.content}
                onChange={(event) => setObservationForm((current) => ({ ...current, content: event.target.value }))}
                className="input min-h-36"
                placeholder="Escreva como aconteceu. Pode ser sobre a turma, um grupo ou um aluno específico."
              />
            </Field>
            <Field label="Tags pedagógicas opcionais">
              <div className="flex flex-wrap gap-2">
                {pedagogicalTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${observationForm.tags.includes(tag) ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/60"}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </Field>
            <ModalActions busy={busy} onCancel={closeModal} />
          </form>
        </Modal>
      ) : null}
    </ProtectedPage>
  );
}

function StudentProfile({
  student,
  observations,
  reports,
  classId,
  onAddObservation
}: {
  student: StudentRow | null;
  observations: ObservationRow[];
  reports: StudentReportRow[];
  classId: string;
  onAddObservation: (student: StudentRow) => void;
}) {
  if (!student) {
    return (
      <aside className="panel p-5 text-sm leading-6 text-ink/60">
        Selecione um aluno para abrir o perfil, ver observações e acessar relatórios.
      </aside>
    );
  }

  return (
    <aside className="panel p-5">
      <p className="label">Perfil do aluno</p>
      <h3 className="mt-1 text-xl font-bold text-ink">{student.name}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/60">
        {student.birth_date ? `Nascimento: ${formatDate(student.birth_date)}` : "Data de nascimento não informada."}
      </p>
      {student.general_notes ? <p className="mt-3 rounded-lg bg-paper p-3 text-sm leading-6 text-ink/70">{student.general_notes}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAddObservation(student)} className="btn-secondary">
          <BookOpen size={16} />
          Observação individual
        </button>
        <Link href={`/relatorios?turma=${classId}&aluno=${student.id}`} className="btn-primary">
          <FileText size={16} />
          Gerar relatório
        </Link>
      </div>

      <div className="mt-5">
        <h4 className="font-bold text-ink">Observações recentes</h4>
        <div className="mt-2 space-y-2">
          {observations.slice(0, 4).map((observation) => (
            <div key={observation.id} className="rounded-lg border border-ink/10 p-3 text-sm">
              <p className="font-semibold text-ink">{formatDate(observation.date)} • {observationTypeLabel(observation.observation_type)}</p>
              <p className="mt-1 line-clamp-3 text-ink/60">{observation.content}</p>
            </div>
          ))}
          {!observations.length ? <p className="text-sm text-ink/55">Nenhuma observação relacionada ainda.</p> : null}
        </div>
      </div>

      <div className="mt-5">
        <h4 className="font-bold text-ink">Relatórios gerados</h4>
        <div className="mt-2 space-y-2">
          {reports.slice(0, 3).map((report) => (
            <Link key={report.id} href={`/relatorios?turma=${classId}&aluno=${student.id}`} className="block rounded-lg border border-ink/10 p-3 text-sm hover:border-leaf/40">
              <p className="font-semibold text-ink">{report.report_type}</p>
              <p className="mt-1 text-ink/55">{formatDate(report.generated_at.slice(0, 10))}</p>
            </Link>
          ))}
          {!reports.length ? <p className="text-sm text-ink/55">Nenhum relatório gerado ainda.</p> : null}
        </div>
      </div>
    </aside>
  );
}

function ObservationList({
  observations,
  links,
  students,
  classStudents
}: {
  observations: ObservationRow[];
  links: ObservationStudentRow[];
  students: StudentRow[];
  classStudents: StudentRow[];
}) {
  const [studentNameFilter, setStudentNameFilter] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [appliesToFilter, setAppliesToFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const tagOptions = useMemo(
    () => Array.from(new Set(observations.flatMap((observation) => observation.tags || []))).sort((a, b) => a.localeCompare(b)),
    [observations]
  );
  const filteredObservations = useMemo(() => {
    const normalizedStudentFilter = normalizeSearch(studentNameFilter);
    return observations.filter((observation) => {
      const observationLinks = links.filter((link) => link.observation_id === observation.id);
      const linkedStudentNames = observationLinks
        .map((link) => students.find((student) => student.id === link.student_id)?.name)
        .filter((name): name is string => Boolean(name));
      const shouldFilterByStudentName = appliesToFilter === "selected_students" || appliesToFilter === "individual_student";
      const matchesStudent = !shouldFilterByStudentName || !normalizedStudentFilter || linkedStudentNames.some((name) => normalizeSearch(name).includes(normalizedStudentFilter));
      const matchesStart = !dateStart || observation.date >= dateStart;
      const matchesEnd = !dateEnd || observation.date <= dateEnd;
      const matchesTag = !tagFilter || (observation.tags || []).includes(tagFilter);
      const matchesAppliesTo = !appliesToFilter || observation.applies_to === appliesToFilter;
      return matchesStudent && matchesStart && matchesEnd && matchesTag && matchesAppliesTo;
    });
  }, [appliesToFilter, dateEnd, dateStart, links, observations, studentNameFilter, students, tagFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredObservations.length / pageSize));
  const visibleObservations = filteredObservations.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [appliesToFilter, dateEnd, dateStart, observations, studentNameFilter, tagFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div>
      <div className="grid gap-3 border-b border-ink/10 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="label mb-2 block">Refere-se a</span>
          <select
            value={appliesToFilter}
            onChange={(event) => {
              const value = event.target.value;
              setAppliesToFilter(value);
              if (value !== "selected_students" && value !== "individual_student") setStudentNameFilter("");
            }}
            className="input"
          >
            <option value="">Todos</option>
            {appliesToOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {appliesToFilter === "selected_students" || appliesToFilter === "individual_student" ? (
          <label className="block">
            <span className="label mb-2 block">Nome do aluno</span>
            <input
              list="observation-student-filter"
              value={studentNameFilter}
              onChange={(event) => setStudentNameFilter(event.target.value)}
              className="input"
              placeholder="Digite o nome do aluno"
            />
            <datalist id="observation-student-filter">
              {classStudents.map((student) => (
                <option key={student.id} value={student.name} />
              ))}
            </datalist>
          </label>
        ) : null}
        <label className="block">
          <span className="label mb-2 block">Data inicial</span>
          <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label mb-2 block">Data final</span>
          <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="label mb-2 block">Tag</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="input">
            <option value="">Todas as tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end md:col-span-2 xl:col-span-3">
          <button
            type="button"
            onClick={() => {
              setStudentNameFilter("");
              setDateStart("");
              setDateEnd("");
              setTagFilter("");
              setAppliesToFilter("");
            }}
            className="btn-secondary"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {!observations.length ? (
        <p className="p-5 text-sm leading-6 text-ink/60">Nenhuma observação registrada para esta turma.</p>
      ) : null}

      {observations.length > 0 && !filteredObservations.length ? (
        <p className="p-5 text-sm leading-6 text-ink/60">Nenhuma observação encontrada com os filtros selecionados.</p>
      ) : null}

      <div className="divide-y divide-ink/10">
      {visibleObservations.map((observation) => {
        const observationTags = observation.tags || [];
        const studentNames = links
          .filter((link) => link.observation_id === observation.id)
          .map((link) => students.find((student) => student.id === link.student_id)?.name)
          .filter(Boolean)
          .join(", ");

        return (
          <article key={observation.id} className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-ink">{observation.title || observationTypeLabel(observation.observation_type)}</p>
                <p className="mt-1 text-xs font-semibold uppercase text-ink/45">
                  {formatDate(observation.date)} • {appliesToLabel(observation.applies_to)}
                </p>
              </div>
              {observationTags.length ? (
                <div className="flex flex-wrap gap-1">
                  {observationTags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-mint px-2 py-1 text-[11px] font-semibold text-leaf">{tag}</span>)}
                </div>
              ) : null}
            </div>
            {studentNames ? <p className="mt-2 text-xs font-semibold text-leaf">Alunos: {studentNames}</p> : null}
            <p className="mt-2 text-sm leading-6 text-ink/65">{observation.content}</p>
          </article>
        );
      })}
      </div>

      {filteredObservations.length > pageSize ? (
        <div className="flex flex-col gap-3 border-t border-ink/10 p-4 text-sm font-semibold text-ink/60 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Página {page} de {totalPages} • {filteredObservations.length} registros
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} className="btn-secondary" disabled={page === 1}>
              Anterior
            </button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="btn-secondary" disabled={page === totalPages}>
              Próxima
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-lg bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md border border-ink/10 p-2 text-ink/60 hover:bg-paper">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
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

function ModalActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
        Cancelar
      </button>
      <button type="submit" className="btn-primary" disabled={busy}>
        <Save size={16} />
        Salvar
      </button>
    </div>
  );
}

function YearFilter({
  years,
  selectedYear,
  onChange
}: {
  years: number[];
  selectedYear: number;
  onChange: (year: number) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onChange(year)}
          className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
            selectedYear === year ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/60 hover:border-leaf/35"
          }`}
        >
          {year}
        </button>
      ))}
    </div>
  );
}

function shouldAttachStudents(appliesTo: ObservationRow["applies_to"]) {
  return appliesTo === "selected_students" || appliesTo === "individual_student";
}

function studentIdsForClass(classId: string, students: StudentRow[]) {
  return students
    .filter((student) => student.class_id === classId && student.status === "active")
    .map((student) => student.id);
}

function buildYearOptions(values: Array<string | null | undefined>) {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const value of values) {
    const year = recordYear(value);
    if (year) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

function recordYear(value?: string | null) {
  if (!value) return null;
  const match = value.match(/(?:19|20)\d{2}/);
  const year = match ? Number(match[0]) : Number(value.slice(0, 4));
  return Number.isFinite(year) && year > 1900 ? year : null;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function observationTypeLabel(value: ObservationRow["observation_type"]) {
  return observationTypes.find((type) => type.value === value)?.label || value;
}

function appliesToLabel(value: ObservationRow["applies_to"]) {
  return appliesToOptions.find((option) => option.value === value)?.label || value;
}
