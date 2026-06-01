"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, FileDown, Filter, FolderMinus, FolderPlus, Pencil, Printer, Save, Trash2 } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { activityTypes, methodologies } from "@/lib/activities/types";
import type { Database, Json } from "@/lib/database.types";
import type { PrintableMaterialPlan } from "@/lib/activities/printable-material";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ActivityWithCollections = Activity & {
  collection_ids?: string[];
  primary_collection_id?: string | null;
};
type Collection = Database["public"]["Tables"]["collections"]["Row"];
type MaterialState = {
  loading: boolean;
  material?: PrintableMaterialPlan | null;
  error?: string | null;
};

type EditState = Partial<Activity> & {
  steps_text?: string;
  teacher_tips_text?: string;
  variations_text?: string;
};

const pageSize = 10;

function arrayText(value: Json | null | undefined) {
  return Array.isArray(value) ? value.map(String).join("\n") : typeof value === "string" ? value : "";
}

function textArray(value: string | undefined) {
  return (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ActivitiesPage() {
  const { supabase } = useAuth();
  const [activities, setActivities] = useState<ActivityWithCollections[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<ActivityWithCollections | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [materialByActivityId, setMaterialByActivityId] = useState<Record<string, MaterialState>>({});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    age_range: "",
    development_area: "",
    methodology: "",
    activity_type: "",
    collection_id: ""
  });
  const [actionCollectionId, setActionCollectionId] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString() ? `/api/activities?${params.toString()}` : "/api/activities";
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(activities.length / pageSize));
  const visibleActivities = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return activities.slice(start, start + pageSize);
  }, [activities, page, totalPages]);

  async function loadActivities() {
    const data = await apiFetch<{ activities: ActivityWithCollections[] }>(supabase, query);
    setActivities(data.activities);
    setSelected((current) => {
      if (!current) return data.activities[0] || null;
      return data.activities.find((activity) => activity.id === current.id) || data.activities[0] || null;
    });
  }

  useEffect(() => {
    Promise.all([
      loadActivities(),
      apiFetch<{ collections: Collection[] }>(supabase, "/api/collections")
    ])
      .then(([, collectionData]) => {
        setCollections(collectionData.collections);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar dados."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, supabase]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!visibleActivities.length) {
      if (selected) setSelected(null);
      return;
    }

    if (!selected || !visibleActivities.some((activity) => activity.id === selected.id)) {
      setSelected(visibleActivities[0]);
      setEdit(null);
    }
  }, [selected, visibleActivities]);

  useEffect(() => {
    setActionCollectionId(selected?.primary_collection_id || selected?.collection_ids?.[0] || "");
    setPendingDeleteId(null);
  }, [selected?.id, selected?.primary_collection_id, selected?.collection_ids]);

  useEffect(() => {
    if (!selected?.id || materialByActivityId[selected.id]) return;

    let cancelled = false;
    const activityId = selected.id;
    setMaterialByActivityId((current) => ({
      ...current,
      [activityId]: { loading: true }
    }));

    apiFetch<{ material: PrintableMaterialPlan }>(supabase, `/api/activities/${activityId}/printable-material`, { method: "POST" })
      .then((data) => {
        if (cancelled) return;
        setMaterialByActivityId((current) => ({
          ...current,
          [activityId]: { loading: false, material: data.material }
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setMaterialByActivityId((current) => ({
          ...current,
          [activityId]: {
            loading: false,
            material: null,
            error: error instanceof Error ? error.message : "Não foi possível analisar o material imprimível."
          }
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [materialByActivityId, selected?.id, supabase]);

  function startEdit(activity: ActivityWithCollections) {
    setSelected(activity);
    setEdit({
      ...activity,
      steps_text: arrayText(activity.steps),
      teacher_tips_text: arrayText(activity.teacher_tips),
      variations_text: arrayText(activity.variations)
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit?.id) return;

    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        title: edit.title,
        age_range: edit.age_range,
        methodology: edit.methodology,
        development_area: edit.development_area,
        activity_type: edit.activity_type,
        environment: edit.environment,
        materials: edit.materials,
        objective: edit.objective,
        estimated_time: edit.estimated_time,
        bncc_code: edit.bncc_code,
        description: edit.description,
        steps: textArray(edit.steps_text),
        teacher_tips: textArray(edit.teacher_tips_text),
        variations: textArray(edit.variations_text),
        safety_notes: edit.safety_notes,
        evaluation: edit.evaluation
      };
      const data = await apiFetch<{ activity: Activity }>(supabase, `/api/activities/${edit.id}`, {
        method: "PUT",
        body: payload
      });
      setSelected(data.activity);
      setEdit(null);
      await loadActivities();
      setMessage("Atividade atualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteActivity(activity: ActivityWithCollections) {
    setBusy(true);
    setMessage(null);
    try {
      const planningStatus = await apiFetch<{ planned: boolean; count: number }>(supabase, `/api/activities/${activity.id}/planning-status`);

      if (planningStatus.planned) {
        const confirmed = window.confirm("Essa atividade está planejada, se você excluir, ela sairá do planejamento, deseja excluir?");
        if (!confirmed) {
          setPendingDeleteId(null);
          return;
        }
      } else if (pendingDeleteId !== activity.id) {
        setPendingDeleteId(activity.id);
        return;
      }

      await apiFetch(supabase, `/api/activities/${activity.id}${planningStatus.planned ? "?remove_planned=true" : ""}`, { method: "DELETE" });
      setSelected(null);
      setEdit(null);
      await loadActivities();
      setMessage("Atividade excluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function addToCollection() {
    if (!selected || !actionCollectionId) return setMessage("Escolha uma atividade e uma coleção.");
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${actionCollectionId}/activities`, {
        method: "POST",
        body: { activity_id: selected.id }
      });
      await loadActivities();
      setMessage("Atividade adicionada à coleção.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar à coleção.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromCollection() {
    if (!selected || !actionCollectionId) return setMessage("Escolha uma atividade e uma coleção.");
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${actionCollectionId}/activities/${selected.id}`, { method: "DELETE" });
      await loadActivities();
      setMessage("Atividade removida da coleção.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover da coleção.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPrintableMaterial(activity: ActivityWithCollections) {
    const materialState = materialByActivityId[activity.id];
    if (!materialState?.material?.has_material) {
      setMessage(materialState?.material?.reason || materialState?.error || "Esta atividade não precisa de material imprimível.");
      return;
    }

    await downloadPdf(
      supabase,
      "/api/pdf/activity-material",
      { activity_id: activity.id, material_plan: materialState.material },
      materialPdfFileName(activity.title)
    );
  }

  return (
    <ProtectedPage title="Atividades" subtitle="Consulte, filtre, edite e reutilize atividades salvas.">
      <section className="panel mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 font-bold">
          <Filter size={18} className="text-leaf" />
          Filtros
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <input className="field" placeholder="Idade" value={filters.age_range} onChange={(event) => setFilters({ ...filters, age_range: event.target.value })} />
          <input className="field" placeholder="Área de Desenvolvimento" value={filters.development_area} onChange={(event) => setFilters({ ...filters, development_area: event.target.value })} />
          <select className="field" value={filters.methodology} onChange={(event) => setFilters({ ...filters, methodology: event.target.value })}>
            <option value="">Metodologia</option>
            {methodologies.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={filters.activity_type} onChange={(event) => setFilters({ ...filters, activity_type: event.target.value })}>
            <option value="">Tipo</option>
            {activityTypes.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select className="field" value={filters.collection_id} onChange={(event) => setFilters({ ...filters, collection_id: event.target.value })}>
            <option value="">Coleção</option>
            {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
        </div>
      </section>

      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-3">
          {visibleActivities.map((activity) => (
            <button
              key={activity.id}
              onClick={() => {
                setSelected(activity);
                setEdit(null);
              }}
              className={`w-full rounded-lg border bg-white p-4 text-left transition ${
                selected?.id === activity.id ? "border-leaf ring-2 ring-leaf/15" : "border-ink/10 hover:border-leaf/40"
              }`}
            >
              <h2 className="font-bold text-ink">{activity.title}</h2>
              <p className="mt-1 text-sm text-ink/60">{activity.age_range || "Faixa etária"} • {activity.methodology || "Metodologia"}</p>
            </button>
          ))}
          {!activities.length ? <div className="panel p-5 text-sm font-semibold text-ink/60">Nenhuma atividade encontrada.</div> : null}
          {activities.length > pageSize ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-white p-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                title="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-bold text-ink/60">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                title="Próxima página"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </aside>

        <section className="space-y-4">
          {selected ? (
            <>
              {(() => {
                const materialState = materialByActivityId[selected.id];
                const materialReady = Boolean(materialState?.material?.has_material);
                const materialReason = materialState?.material?.reason || materialState?.error || "";

                return (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button onClick={() => startEdit(selected)} className="btn-secondary">
                  <Pencil size={16} />
                  Editar
                </button>
                <button onClick={() => downloadPdf(supabase, "/api/pdf/activity", { activity_id: selected.id }, pdfFileName(selected.title))} className="btn-secondary">
                  <FileDown size={16} />
                  PDF
                </button>
                <button
                  disabled={busy || materialState?.loading || !materialReady}
                  onClick={() => downloadPrintableMaterial(selected)}
                  className="btn-secondary col-span-2 sm:col-span-1 disabled:cursor-not-allowed disabled:opacity-50"
                  title={materialState?.loading ? "A IA está analisando se esta atividade precisa de material imprimível." : materialReason}
                >
                  <Printer size={16} />
                  {materialState?.loading ? "Analisando material..." : "Material imprimível"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    handleDeleteActivity(selected);
                  }}
                  className="btn-danger"
                >
                  <Trash2 size={16} />
                  {pendingDeleteId === selected.id ? "Confirmar exclusão" : "Excluir"}
                </button>
              </div>
                );
              })()}

              {selected && !materialByActivityId[selected.id]?.loading && materialByActivityId[selected.id]?.material?.has_material === false ? (
                <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                  {materialByActivityId[selected.id]?.material?.reason || "A IA avaliou que esta atividade não precisa de material imprimível."}
                </p>
              ) : null}

              {selected && !materialByActivityId[selected.id]?.loading && materialByActivityId[selected.id]?.error ? (
                <p className="rounded-lg border border-sun/30 bg-sun/10 px-4 py-3 text-sm text-ink/70">
                  {materialByActivityId[selected.id]?.error}
                </p>
              ) : null}

              <div className="rounded-lg border border-ink/10 bg-white p-4">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <select className="field" value={actionCollectionId} onChange={(event) => setActionCollectionId(event.target.value)}>
                    <option value="">Coleção</option>
                    {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                  </select>
                  <button disabled={busy} onClick={addToCollection} className="btn-secondary px-3" title="Adicionar à coleção">
                    <FolderPlus size={17} />
                  </button>
                  <button disabled={busy} onClick={removeFromCollection} className="btn-secondary px-3" title="Remover da coleção">
                    <FolderMinus size={17} />
                  </button>
                </div>
              </div>

              {edit ? (
                <form onSubmit={saveEdit} className="panel space-y-4 p-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <EditInput label="Título" value={edit.title} onChange={(value) => setEdit({ ...edit, title: value })} />
                    <EditInput label="Faixa etária" value={edit.age_range} onChange={(value) => setEdit({ ...edit, age_range: value })} />
                    <EditInput label="Tempo estimado" value={edit.estimated_time} onChange={(value) => setEdit({ ...edit, estimated_time: value })} />
                    <EditInput label="Área" value={edit.development_area} onChange={(value) => setEdit({ ...edit, development_area: value })} />
                    <EditInput label="Metodologia" value={edit.methodology} onChange={(value) => setEdit({ ...edit, methodology: value })} />
                    <EditInput label="Tipo" value={edit.activity_type} onChange={(value) => setEdit({ ...edit, activity_type: value })} />
                    <EditInput label="Ambiente" value={edit.environment} onChange={(value) => setEdit({ ...edit, environment: value })} />
                    <EditInput label="BNCC" value={edit.bncc_code} onChange={(value) => setEdit({ ...edit, bncc_code: value })} />
                  </div>
                  <EditArea label="Materiais" value={edit.materials} onChange={(value) => setEdit({ ...edit, materials: value })} />
                  <EditArea label="Objetivo" value={edit.objective} onChange={(value) => setEdit({ ...edit, objective: value })} />
                  <EditArea label="Descrição" value={edit.description} onChange={(value) => setEdit({ ...edit, description: value })} />
                  <EditArea label="Passo a passo (uma linha por item)" value={edit.steps_text} onChange={(value) => setEdit({ ...edit, steps_text: value })} />
                  <EditArea label="Dicas (uma linha por item)" value={edit.teacher_tips_text} onChange={(value) => setEdit({ ...edit, teacher_tips_text: value })} />
                  <EditArea label="Variações (uma linha por item)" value={edit.variations_text} onChange={(value) => setEdit({ ...edit, variations_text: value })} />
                  <EditArea label="Segurança" value={edit.safety_notes} onChange={(value) => setEdit({ ...edit, safety_notes: value })} />
                  <EditArea label="Avaliação" value={edit.evaluation} onChange={(value) => setEdit({ ...edit, evaluation: value })} />
                  <div className="flex gap-2">
                    <button disabled={busy} className="btn-primary">
                      <Save size={16} />
                      Salvar edição
                    </button>
                    <button type="button" onClick={() => setEdit(null)} className="btn-secondary">
                      <Eye size={16} />
                      Voltar à visualização
                    </button>
                  </div>
                </form>
              ) : (
                <ActivityView activity={selected} />
              )}
            </>
          ) : (
            <div className="panel p-8 text-center text-sm font-semibold text-ink/60">Selecione uma atividade.</div>
          )}
        </section>
      </div>
    </ProtectedPage>
  );
}

function pdfFileName(title: string | null) {
  const safeTitle = (title || "atividade").replace(/[\\/]/g, "-").trim() || "atividade";
  return `${safeTitle}.pdf`;
}

function materialPdfFileName(title: string | null) {
  const safeTitle = (title || "atividade").replace(/[\\/]/g, "-").trim() || "atividade";
  return `${safeTitle}-material.pdf`;
}

function EditInput({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="label mb-2 block">{label}</span>
      <input className="field" value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function EditArea({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="label mb-2 block">{label}</span>
      <textarea className="field min-h-24" value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
