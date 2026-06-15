"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, FileDown, Filter, FolderMinus, FolderPlus, Pencil, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import {
  initialManualActivityForm,
  ManualActivityFields,
  type ManualActivityForm,
  resolveManualActivityForm
} from "@/components/ui/ManualActivityFields";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, downloadPdf } from "@/lib/api/client";
import { activityTypes, methodologies } from "@/lib/activities/types";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import type { Database, Json } from "@/lib/database.types";
import type { PrintableMaterialPlan } from "@/lib/activities/printable-material";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ActivityWithCollections = Activity & {
  collection_ids?: string[];
  primary_collection_id?: string | null;
};
type Collection = Database["public"]["Tables"]["collections"]["Row"];
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

function getSavedPrintableMaterialPlan(rawAiResponse: Json | null): PrintableMaterialPlan | null {
  if (!rawAiResponse || typeof rawAiResponse !== "object" || Array.isArray(rawAiResponse)) return null;
  const material = (rawAiResponse as { printable_material?: unknown }).printable_material;

  if (!material || typeof material !== "object" || Array.isArray(material)) return null;
  if (typeof (material as { has_material?: unknown }).has_material !== "boolean") return null;

  return material as PrintableMaterialPlan;
}

function printableMaterialReason(material: PrintableMaterialPlan | null, fallback: string) {
  const reason = material?.reason;
  const text = typeof reason !== "string" || !reason.trim() || isTechnicalMaterialReason(reason) ? fallback : reason;
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function isTechnicalMaterialReason(reason: string) {
  const normalized = reason.toLowerCase();
  return [
    '"code":',
    '"path":',
    "too_small",
    "invalid_type",
    "zod",
    "string must contain",
    "claude api",
    "anthropic",
    "expected ",
    "precisa de uma nova composição",
    "precisa de uma nova composicao"
  ].some((token) => normalized.includes(token));
}

function printableMaterialNeedsRetry(material: PrintableMaterialPlan | null) {
  if (!material) return true;
  if (material.has_material) return false;
  return !material.reason || isTechnicalMaterialReason(material.reason);
}

export default function ActivitiesPage() {
  const { supabase, usage } = useAuth();
  const [highlightedActivityId, setHighlightedActivityId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityWithCollections[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<ActivityWithCollections | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [plannedDeleteActivity, setPlannedDeleteActivity] = useState<ActivityWithCollections | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    age_range: "",
    development_area: "",
    methodology: "",
    activity_type: "",
    collection_id: ""
  });
  const [actionCollectionId, setActionCollectionId] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualActivityForm>(initialManualActivityForm);

  useEffect(() => {
    setHighlightedActivityId(new URLSearchParams(window.location.search).get("atividade"));
  }, []);

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
    const highlightedIndex = highlightedActivityId
      ? data.activities.findIndex((activity) => activity.id === highlightedActivityId)
      : -1;

    setActivities(data.activities);
    if (highlightedIndex >= 0) {
      setPage(Math.floor(highlightedIndex / pageSize) + 1);
      setSelected(data.activities[highlightedIndex]);
      setEdit(null);
      return;
    }

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
  }, [highlightedActivityId, query, supabase]);

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

  function openManualModal() {
    setManualForm(initialManualActivityForm);
    setManualModalOpen(true);
    setMessage(null);
  }

  function closeManualModal() {
    setManualModalOpen(false);
    setManualForm(initialManualActivityForm);
  }

  function updateManualField<K extends keyof ManualActivityForm>(key: K, value: ManualActivityForm[K]) {
    setManualForm((current) => ({ ...current, [key]: value }));
  }

  async function createManualActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const manualPayload = resolveManualActivityForm(manualForm);
      const data = await apiFetch<{ activity: Activity }>(supabase, "/api/activities", {
        method: "POST",
        body: manualPayload.activity
      });
      const created = { ...data.activity, collection_ids: [], primary_collection_id: null };
      setActivities((current) => [created, ...current]);
      setSelected(created);
      setEdit(null);
      setPage(1);
      closeManualModal();
      setMessage("Atividade criada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a atividade.");
    } finally {
      setBusy(false);
    }
  }

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
        setPlannedDeleteActivity(activity);
        setPendingDeleteId(null);
        return;
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

  async function confirmPlannedDelete() {
    if (!plannedDeleteActivity) return;

    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/activities/${plannedDeleteActivity.id}?remove_planned=true`, { method: "DELETE" });
      setPlannedDeleteActivity(null);
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
    if (!canUsePrintableMaterial(usage?.plan_key)) {
      setMessage("Material imprimível disponível nos planos Completo e Pro.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      let material = getSavedPrintableMaterialPlan(activity.raw_ai_response);

      if (!material?.has_material && printableMaterialNeedsRetry(material)) {
        const result = await apiFetch<{ material: PrintableMaterialPlan }>(
          supabase,
          `/api/activities/${activity.id}/printable-material`,
          { method: "POST" }
        );
        material = result.material;
        await loadActivities();
      }

      if (!material?.has_material) {
        setMessage(printableMaterialReason(material, "Esta atividade não possui material imprimível disponível."));
        return;
      }

      await downloadPdf(
        supabase,
        "/api/pdf/activity-material",
        { activity_id: activity.id },
        materialPdfFileName(activity.title)
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível preparar o material imprimível.");
    } finally {
      setBusy(false);
    }
  }

  function activityCollections(activity: ActivityWithCollections) {
    const ids = activity.collection_ids || [];
    return ids
      .map((id) => collections.find((collection) => collection.id === id))
      .filter((collection): collection is Collection => Boolean(collection));
  }

  return (
    <ProtectedPage
      title="Atividades"
      subtitle="Consulte, filtre, edite e reutilize atividades salvas."
      actions={
        <button type="button" onClick={openManualModal} className="btn-primary">
          <Plus size={17} />
          Criar atividade
        </button>
      }
    >
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
        <aside className="rounded-lg border border-ink/10 bg-white p-3 shadow-soft lg:space-y-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
            <p className="label">Lista de atividades</p>
            <span className="text-xs font-bold text-ink/45">{activities.length} itens</span>
          </div>

          <div className="space-y-3">
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                {activityCollections(activity).length ? (
                  activityCollections(activity).map((collection) => (
                    <span
                      key={collection.id}
                      className="rounded-full border px-2 py-0.5 text-[11px] font-bold text-ink/65"
                      style={{
                        borderColor: collection.color || "#d9ded8",
                        backgroundColor: `${collection.color || "#2f7d58"}18`
                      }}
                    >
                      {collection.name}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-ink/10 bg-paper px-2 py-0.5 text-[11px] font-bold text-ink/45">
                    Sem coleção
                  </span>
                )}
              </div>
            </button>
            ))}
          </div>
          {!activities.length ? <div className="panel mt-3 p-5 text-sm font-semibold text-ink/60 lg:mt-0">Nenhuma atividade encontrada.</div> : null}
          {activities.length > pageSize ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-white p-2 lg:mt-0">
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
              <div className="rounded-lg border border-leaf/20 bg-mint/45 px-4 py-3 lg:hidden">
                <p className="label mb-1">Detalhe da atividade</p>
                <h2 className="text-base font-bold text-ink">{selected.title}</h2>
              </div>

              {(() => {
                const material = getSavedPrintableMaterialPlan(selected.raw_ai_response);
                const materialReady = Boolean(material?.has_material);
                const materialAllowed = canUsePrintableMaterial(usage?.plan_key);
                const materialReason = !materialAllowed
                  ? "Material imprimível disponível nos planos Completo e Pro."
                  : printableMaterialReason(material, "Esta atividade ainda não possui análise de material imprimível salva.");
                const materialRetryable = materialAllowed && printableMaterialNeedsRetry(material);
                const canDownloadMaterial = materialAllowed && (materialReady || materialRetryable);
                const summary = material?.usage_summary;
                const pageCount = summary?.page_count || material?.pages.length || 0;

                return (
              <>
              {canDownloadMaterial ? (
                <div className="rounded-lg border border-leaf/20 bg-mint/35 p-4">
                  <p className="font-bold text-ink">Material imprimível gerado</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-ink/65">
                    <span>{pageCount} {pageCount === 1 ? "página" : "páginas"}</span>
                    <span>{summary?.color_mode || "colorido"}</span>
                    <span>Formato {summary?.paper_size || "A4"}</span>
                    {summary?.techniques?.length ? <span>Inclui {summary.techniques.join(", ")}</span> : null}
                    {summary?.ideal_for ? <span>Ideal para {summary.ideal_for}</span> : null}
                  </div>
                  {summary?.suggestion ? (
                    <p className="mt-3 text-sm text-ink/65">
                      <strong className="text-ink">Sugestão de uso:</strong> {summary.suggestion}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-ink/10 bg-white p-3 shadow-soft sm:flex sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                <button onClick={() => startEdit(selected)} className="btn-secondary">
                  <Pencil size={16} />
                  Editar
                </button>
                <button onClick={() => downloadPdf(supabase, "/api/pdf/activity", { activity_id: selected.id }, pdfFileName(selected.title))} className="btn-secondary">
                  <FileDown size={16} />
                  PDF
                </button>
                <button
                  disabled={busy || !canDownloadMaterial}
                  onClick={() => downloadPrintableMaterial(selected)}
                  className="btn-secondary col-span-2 sm:col-span-1 disabled:cursor-not-allowed disabled:opacity-50"
                  title={canDownloadMaterial ? "Baixar material imprimível desta atividade." : materialReason}
                >
                  <Printer size={16} />
                  {materialReady ? "Material imprimível" : "Preparar material imprimível"}
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
              </>
                );
              })()}

              {selected && usage && !canUsePrintableMaterial(usage.plan_key) ? (
                <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                  Material imprimível disponível nos planos Completo e Pro.{" "}
                  <Link href="/planos" className="font-bold text-leaf underline decoration-leaf/35 underline-offset-2">
                    Fazer upgrade do plano
                  </Link>
                </p>
              ) : null}

              {selected &&
              canUsePrintableMaterial(usage?.plan_key) &&
              getSavedPrintableMaterialPlan(selected.raw_ai_response)?.has_material === false &&
              !printableMaterialNeedsRetry(getSavedPrintableMaterialPlan(selected.raw_ai_response)) ? (
                <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                  {printableMaterialReason(
                    getSavedPrintableMaterialPlan(selected.raw_ai_response),
                    "Não foi possível preparar um material imprimível funcional para esta atividade."
                  )}
                </p>
              ) : null}

              {selected && canUsePrintableMaterial(usage?.plan_key) && !getSavedPrintableMaterialPlan(selected.raw_ai_response) ? (
                <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                  Esta atividade ainda não possui material salvo. Use o botão “Preparar material imprimível” para gerar e baixar sem consumir uma nova atividade do plano.
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

      {plannedDeleteActivity ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-6">
          <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <p className="label mb-2">Confirmar exclusão</p>
            <h2 className="text-lg font-bold text-ink">Atividade planejada</h2>
            <p className="mt-3 text-sm leading-6 text-ink/70">
              Essa atividade está planejada, se você excluir, ela sairá do planejamento, deseja excluir?
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setPlannedDeleteActivity(null)} className="btn-secondary">
                Cancelar
              </button>
              <button type="button" disabled={busy} onClick={confirmPlannedDelete} className="btn-danger">
                <Trash2 size={16} />
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {manualModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6">
          <form onSubmit={createManualActivity} className="w-full max-w-2xl rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label mb-2">Atividades</p>
                <h2 className="text-xl font-bold text-ink">Nova atividade</h2>
              </div>
              <button type="button" onClick={closeManualModal} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
                <X size={17} />
              </button>
            </div>

            <ManualActivityFields form={manualForm} onChange={updateManualField} />

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeManualModal} disabled={busy} className="btn-secondary">
                Cancelar
              </button>
              <button disabled={busy} className="btn-primary">
                <Save size={16} />
                Salvar atividade
              </button>
            </div>
          </form>
        </div>
      ) : null}
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
