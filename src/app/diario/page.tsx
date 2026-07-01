"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, School } from "lucide-react";
import { ClassLessonRecordEditor } from "@/components/classes/ClassLessonRecordEditor";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Database } from "@/lib/database.types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type ClassActivity = Database["public"]["Tables"]["class_activities"]["Row"] & { activities?: Activity | null };

export default function JournalPage() {
  return (
    <Suspense fallback={<div className="panel p-6 text-sm font-semibold text-ink/60">Carregando diário...</div>}>
      <JournalPageContent />
    </Suspense>
  );
}

function JournalPageContent() {
  const searchParams = useSearchParams();
  const requestedClassId = searchParams.get("turma") || "";
  const requestedActivityId = searchParams.get("atividade") || "";
  const requestedDate = validDate(searchParams.get("data")) ? searchParams.get("data") || undefined : undefined;
  const { supabase } = useAuth();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classActivities, setClassActivities] = useState<ClassActivity[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedClass = classes.find((classItem) => classItem.id === selectedClassId) || null;
  const assignedActivities = useMemo(
    () => classActivities
      .filter((item) => item.class_id === selectedClassId && item.activities)
      .map((item) => item.activities as Activity),
    [classActivities, selectedClassId]
  );
  const selectedActivity = assignedActivities.find((activity) => activity.id === selectedActivityId) || null;
  const initialLessonDate = selectedClassId === requestedClassId ? requestedDate : undefined;

  useEffect(() => {
    void loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!assignedActivities.length) {
      setSelectedActivityId("");
      return;
    }

    const requestedActivityIsAvailable = selectedClassId === requestedClassId
      && assignedActivities.some((activity) => activity.id === requestedActivityId);
    setSelectedActivityId((current) => {
      if (requestedActivityIsAvailable) return requestedActivityId;
      if (assignedActivities.some((activity) => activity.id === current)) return current;
      return assignedActivities[0].id;
    });
  }, [assignedActivities, requestedActivityId, requestedClassId, selectedClassId]);

  async function loadJournal() {
    setLoading(true);
    try {
      const [classesResponse, activitiesResponse] = await Promise.all([
        supabase.from("classes").select("*").order("name"),
        supabase.from("class_activities").select("*, activities(*)").order("created_at", { ascending: false })
      ]);
      if (classesResponse.error) throw classesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const nextClasses = classesResponse.data || [];
      setClasses(nextClasses);
      setClassActivities((activitiesResponse.data || []) as ClassActivity[]);
      setSelectedClassId(
        nextClasses.some((classItem) => classItem.id === requestedClassId)
          ? requestedClassId
          : nextClasses[0]?.id || ""
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o Diário.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedPage title="Diário" subtitle="Registre rapidamente como foi o desempenho da turma após uma atividade.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      {loading ? (
        <div className="panel p-8 text-center text-sm font-semibold text-ink/55">Carregando turmas e atividades...</div>
      ) : classes.length ? (
        <div className="space-y-5">
          <section className="panel p-4">
            <div className="flex items-center gap-2">
              <School size={18} className="text-leaf" />
              <p className="label">Turma</p>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {classes.map((classItem) => (
                <button
                  key={classItem.id}
                  type="button"
                  onClick={() => setSelectedClassId(classItem.id)}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-bold transition ${selectedClassId === classItem.id ? "border-leaf bg-mint text-leaf ring-2 ring-leaf/15" : "border-ink/10 bg-white text-ink/60 hover:border-leaf/35 hover:text-leaf"}`}
                >
                  {classItem.name}{classItem.shift ? ` - ${classItem.shift}` : ""}
                </button>
              ))}
            </div>
          </section>

          {selectedClass ? (
            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="panel overflow-hidden lg:sticky lg:top-24">
                <div className="border-b border-ink/10 p-4">
                  <div className="flex items-center gap-2">
                    <BookOpenCheck size={18} className="text-leaf" />
                    <h2 className="font-bold text-ink">Atividade realizada</h2>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-ink/45">
                    {assignedActivities.length} atividade{assignedActivities.length === 1 ? "" : "s"} atribuída{assignedActivities.length === 1 ? "" : "s"}
                  </p>
                </div>

                {assignedActivities.length ? (
                  <div className="flex gap-2 overflow-x-auto p-3 lg:block lg:max-h-[calc(100vh-260px)] lg:space-y-2 lg:overflow-y-auto">
                    {assignedActivities.map((activity) => (
                      <button
                        key={activity.id}
                        type="button"
                        onClick={() => setSelectedActivityId(activity.id)}
                        className={`min-w-[230px] rounded-lg border px-3 py-3 text-left transition lg:block lg:w-full lg:min-w-0 ${selectedActivityId === activity.id ? "border-leaf bg-mint text-leaf ring-2 ring-leaf/15" : "border-ink/10 bg-white text-ink hover:border-leaf/35"}`}
                      >
                        <span className="line-clamp-2 text-sm font-bold">{activity.title}</span>
                        <span className={`mt-1.5 block truncate text-xs font-semibold ${selectedActivityId === activity.id ? "text-leaf/70" : "text-ink/45"}`}>
                          {[activity.age_range, activity.development_area].filter(Boolean).join(" • ") || "Sem detalhes"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-center">
                    <p className="text-sm text-ink/60">Nenhuma atividade atribuída a esta turma.</p>
                    <Link href="/alunos?view=classes" className="mt-4 inline-flex text-sm font-bold text-leaf underline underline-offset-4">Atribuir atividade</Link>
                  </div>
                )}
              </aside>

              <div className="min-w-0">
                {selectedActivity ? (
                  <ClassLessonRecordEditor
                    key={`${selectedClass.id}-${selectedActivity.id}-${initialLessonDate || "today"}`}
                    classItem={selectedClass}
                    activities={[selectedActivity]}
                    initialActivityId={selectedActivity.id}
                    initialLessonDate={initialLessonDate}
                    onSaved={setMessage}
                    onError={setMessage}
                  />
                ) : (
                  <section className="panel p-8 text-center">
                    <BookOpenCheck size={28} className="mx-auto text-ink/30" />
                    <h2 className="mt-3 text-lg font-bold text-ink">Selecione uma atividade</h2>
                    <p className="mt-2 text-sm text-ink/60">Escolha uma atividade da coluna ao lado para registrar o desempenho da turma.</p>
                  </section>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <section className="panel p-8 text-center">
          <School size={28} className="mx-auto text-ink/30" />
          <h2 className="mt-3 text-lg font-bold text-ink">Crie uma turma primeiro</h2>
          <p className="mt-2 text-sm text-ink/60">O Diário organiza os registros a partir das turmas cadastradas.</p>
          <Link href="/alunos?view=classes" className="btn-primary mt-5">Criar turma</Link>
        </section>
      )}
    </ProtectedPage>
  );
}

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
