"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Eye, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { UndoToast, useUndoableAction } from "@/components/ui/UndoToast";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { collectionLimit } from "@/lib/billing/plans";
import type { Database } from "@/lib/database.types";

type Collection = Database["public"]["Tables"]["collections"]["Row"];
type CollectionCard = Collection & { activity_count?: number };
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ModalMode = "create" | "edit" | null;

const defaultCollectionColor = "#2f7d58";

export default function CollectionsPage() {
  const { supabase, usage } = useAuth();
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<CollectionCard | null>(null);
  const [collectionActivities, setCollectionActivities] = useState<Activity[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(defaultCollectionColor);
  const [editingCollection, setEditingCollection] = useState<CollectionCard | null>(null);
  const [activityId, setActivityId] = useState("");
  const [movingActivityId, setMovingActivityId] = useState<string | null>(null);
  const [moveTargetCollectionId, setMoveTargetCollectionId] = useState("");
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { pendingAction, schedule: scheduleDeletion, undo: undoDeletion } = useUndoableAction();

  const pageColors = Array.from(
    new Set(collections.map((collection) => collection.color).filter((item): item is string => Boolean(item)))
  );
  const limit = collectionLimit(usage?.plan_key);
  const hasCollectionLimit = typeof limit === "number";
  const canCreateCollection = !usage || !hasCollectionLimit || collections.length < limit;
  const collectionLimitLabel = usage
    ? hasCollectionLimit
      ? `${collections.length}/${limit} coleções`
      : `${collections.length} coleções`
    : `${collections.length} coleções`;
  const collectionLimitMessage =
    usage && hasCollectionLimit
      ? `Seu plano ${usage.plan_name} permite até ${limit} ${limit === 1 ? "coleção" : "coleções"}.`
      : null;

  async function loadCollections() {
    const data = await apiFetch<{ collections: CollectionCard[] }>(supabase, "/api/collections");
    setCollections(data.collections);
    setSelected((current) => {
      if (!current) return data.collections[0] || null;
      return data.collections.find((collection) => collection.id === current.id) || data.collections[0] || null;
    });
  }

  async function loadCollectionDetails(collectionId: string) {
    const data = await apiFetch<{ collection: Collection; activities: Activity[] }>(supabase, `/api/collections/${collectionId}`);
    setSelected({
      ...data.collection,
      activity_count: data.activities.length
    });
    setCollectionActivities(data.activities);
  }

  useEffect(() => {
    Promise.all([
      loadCollections(),
      apiFetch<{ activities: Activity[] }>(supabase, "/api/activities")
    ])
      .then(([, activityData]) => setActivities(activityData.activities))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar coleções."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (selected?.id) {
      setMovingActivityId(null);
      setMoveTargetCollectionId("");
      loadCollectionDetails(selected.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function openCreateModal() {
    if (!canCreateCollection) {
      setMessage(`${collectionLimitMessage} Para criar mais coleções, faça upgrade do plano.`);
      return;
    }

    setName("");
    setDescription("");
    setColor(defaultCollectionColor);
    setEditingCollection(null);
    setModalMode("create");
  }

  function openEditModal(collection: CollectionCard) {
    setName(collection.name);
    setDescription(collection.description || "");
    setColor(collection.color || defaultCollectionColor);
    setEditingCollection(collection);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingCollection(null);
    setName("");
    setDescription("");
    setColor(defaultCollectionColor);
  }

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ collection: Collection }>(supabase, "/api/collections", {
        method: "POST",
        body: { name, description: description || null, color }
      });
      setSelected({ ...data.collection, activity_count: 0 });
      await loadCollections();
      closeModal();
      setMessage("Coleção criada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCollection) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ collection: Collection }>(supabase, `/api/collections/${editingCollection.id}`, {
        method: "PUT",
        body: { name, description: description || null, color }
      });
      setSelected({
        ...data.collection,
        activity_count: editingCollection.activity_count || 0
      });
      await loadCollections();
      closeModal();
      setMessage("Coleção atualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  function deleteCollection(collection: CollectionCard) {
    setMessage(null);
    const collectionsSnapshot = collections;
    const selectedSnapshot = selected;
    const activitiesSnapshot = collectionActivities;
    const remaining = collections.filter((item) => item.id !== collection.id);

    setCollections(remaining);
    if (selected?.id === collection.id) {
      setSelected(remaining[0] || null);
      setCollectionActivities([]);
    }
    scheduleDeletion({
      message: "Coleção excluída.",
      commit: () => apiFetch(supabase, `/api/collections/${collection.id}`, { method: "DELETE" }),
      undo: () => {
        setCollections(collectionsSnapshot);
        setSelected(selectedSnapshot);
        setCollectionActivities(activitiesSnapshot);
      },
      onError: (error) => setMessage(error instanceof Error ? error.message : "Não foi possível excluir.")
    });
  }

  async function addActivity() {
    if (!selected || !activityId) return setMessage("Escolha uma atividade.");
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${selected.id}/activities`, {
        method: "POST",
        body: { activity_id: activityId }
      });
      await loadCollectionDetails(selected.id);
      await loadCollections();
      setActivityId("");
      setMessage("Atividade adicionada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  function removeActivity(id: string) {
    if (!selected) return;
    setMessage(null);
    const selectedSnapshot = selected;
    const activitiesSnapshot = collectionActivities;
    const collectionsSnapshot = collections;
    const collectionId = selected.id;

    setCollectionActivities((current) => current.filter((activity) => activity.id !== id));
    setSelected((current) => current ? { ...current, activity_count: Math.max(0, (current.activity_count || 0) - 1) } : current);
    setCollections((current) => current.map((collection) => collection.id === collectionId
      ? { ...collection, activity_count: Math.max(0, (collection.activity_count || 0) - 1) }
      : collection));
    scheduleDeletion({
      message: "Atividade removida da coleção.",
      commit: () => apiFetch(supabase, `/api/collections/${collectionId}/activities/${id}`, { method: "DELETE" }),
      undo: () => {
        setSelected(selectedSnapshot);
        setCollectionActivities(activitiesSnapshot);
        setCollections(collectionsSnapshot);
      },
      onError: (error) => setMessage(error instanceof Error ? error.message : "Não foi possível remover.")
    });
  }

  function cancelMoveActivity() {
    setMovingActivityId(null);
    setMoveTargetCollectionId("");
  }

  async function saveMoveActivity(activityIdToMove: string) {
    if (!selected || !moveTargetCollectionId || moveTargetCollectionId === selected.id) {
      cancelMoveActivity();
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${moveTargetCollectionId}/activities`, {
        method: "POST",
        body: { activity_id: activityIdToMove }
      });
      await apiFetch(supabase, `/api/collections/${selected.id}/activities/${activityIdToMove}`, { method: "DELETE" });
      await loadCollectionDetails(selected.id);
      await loadCollections();
      cancelMoveActivity();
      setMessage("Atividade movida para outra coleção.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível mover a atividade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage
      title="Coleções"
      subtitle="Crie grupos temáticos para reaproveitar atividades em projetos, datas e objetivos pedagógicos."
      actions={
        <button type="button" onClick={openCreateModal} disabled={!canCreateCollection} className="btn-primary disabled:cursor-not-allowed disabled:opacity-55" title={!canCreateCollection ? collectionLimitMessage || "Limite de coleções atingido." : "Criar coleção"}>
          <Plus size={17} />
          Criar Coleção
        </button>
      }
    >
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <div className="space-y-5">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold">
              <FolderKanban size={18} className="text-leaf" />
              Coleções salvas
            </div>
            <span className="badge">{collectionLimitLabel}</span>
          </div>
          {collectionLimitMessage ? (
            <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/65">
              {collectionLimitMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">
            {collections.map((collection) => (
              <div
                key={collection.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelected(collection);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    setSelected(collection);
                  }
                }}
                style={{
                  borderTopColor: collection.color || defaultCollectionColor,
                  borderBottomColor: collection.color || defaultCollectionColor
                }}
                className={`panel block min-h-[150px] border-x-0 border-y-[8px] p-3 text-left transition hover:-translate-y-0.5 sm:min-h-[180px] sm:p-5 ${
                  selected?.id === collection.id ? "bg-mint/20 ring-2 ring-leaf ring-offset-2 ring-offset-paper" : ""
                }`}
                aria-pressed={selected?.id === collection.id}
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-mint text-leaf sm:h-11 sm:w-11">
                    <FolderKanban size={20} />
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(collection);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 bg-white text-ink/60 transition hover:border-leaf/40 hover:text-leaf"
                      title="Editar coleção"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteCollection(collection);
                      }}
                      className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 bg-white text-ink/60 transition hover:border-clay/40 hover:text-clay"
                      title="Excluir coleção"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h2 className="mt-4 text-base font-bold text-ink sm:mt-5 sm:text-lg">{collection.name}</h2>
                <p className="mt-2 min-h-10 text-xs leading-5 text-ink/60 sm:text-sm">{collection.description || "Sem descrição"}</p>
                <p className="mt-4 text-sm font-semibold text-leaf">
                  {collection.activity_count || 0} {(collection.activity_count || 0) === 1 ? "atividade salva" : "atividades salvas"}
                </p>
              </div>
            ))}

            {!collections.length ? (
              <div className="rounded-lg border border-dashed border-ink/20 bg-white p-6 text-center text-sm font-semibold text-ink/60 md:col-span-2 xl:col-span-3">
                Nenhuma coleção criada ainda.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          {selected ? (
            <>
              <div className="panel p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <Eye size={18} className="text-leaf" />
                    Atividades da coleção: {selected.name}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{collectionActivities.length} itens</span>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
                  <select className="field" value={activityId} onChange={(event) => setActivityId(event.target.value)}>
                    <option value="">Adicionar atividade salva</option>
                    {activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.title}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy} onClick={addActivity} className="btn-secondary px-3" title="Adicionar atividade">
                    <Plus size={17} />
                  </button>
                </div>

                <div className="space-y-3">
                  {collectionActivities.map((activity) => (
                    <div
                      key={activity.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewActivity(activity)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setViewActivity(activity);
                      }}
                      className="grid gap-3 rounded-lg border border-ink/10 bg-white p-3 text-left transition hover:border-leaf/35 lg:grid-cols-[1fr_360px_auto] lg:p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 text-sm font-bold leading-5 sm:text-base">{activity.title}</h3>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              removeActivity(activity.id);
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-clay/40 hover:text-clay lg:hidden"
                            title="Remover da coleção"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-ink/60">{activity.age_range || "Faixa etária"} • {activity.development_area || "Área"}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]" onClick={(event) => event.stopPropagation()}>
                        <select
                          className="field"
                          value={movingActivityId === activity.id ? moveTargetCollectionId : selected.id}
                          onChange={(event) => {
                            setMovingActivityId(activity.id);
                            setMoveTargetCollectionId(event.target.value);
                          }}
                          title="Mudar coleção"
                        >
                          {collections.map((collection) => (
                            <option key={collection.id} value={collection.id}>
                              {collection.name}
                            </option>
                          ))}
                        </select>
                        {movingActivityId === activity.id ? (
                          <>
                            <button type="button" disabled={busy} onClick={cancelMoveActivity} className="grid h-10 w-10 place-items-center rounded-md border border-clay/25 bg-clay/10 text-clay transition hover:bg-clay/15" title="Cancelar mudança">
                              <X size={17} />
                            </button>
                            <button type="button" disabled={busy} onClick={() => saveMoveActivity(activity.id)} className="grid h-10 w-10 place-items-center rounded-md border border-leaf/25 bg-mint text-leaf transition hover:border-leaf/45 hover:bg-mint/80" title="Salvar mudança">
                              <Check size={17} />
                            </button>
                          </>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeActivity(activity.id);
                        }}
                        className="hidden px-3 lg:inline-flex btn-secondary"
                        title="Remover da coleção"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}

                  {!collectionActivities.length ? (
                    <div className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-sm font-semibold text-ink/60">
                      Nenhuma atividade nesta coleção.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="panel p-8 text-center text-sm font-semibold text-ink/60">Selecione ou crie uma coleção.</div>
          )}
        </section>
      </div>

      {modalMode ? (
        <CollectionModal
          mode={modalMode}
          name={name}
          description={description}
          color={color}
          busy={busy}
          onClose={closeModal}
          onSubmit={modalMode === "create" ? createCollection : updateCollection}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onColorChange={setColor}
          pageColors={pageColors}
        />
      ) : null}

      {viewActivity ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/45 px-4 py-6">
          <div className="mx-auto w-full max-w-4xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setViewActivity(null)}
                className="grid h-10 w-10 place-items-center rounded-md border border-ink/10 bg-white text-ink/60 shadow-soft hover:text-ink"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <ActivityView activity={viewActivity} />
          </div>
        </div>
      ) : null}
      <UndoToast action={pendingAction} onUndo={undoDeletion} />
    </ProtectedPage>
  );
}

function CollectionModal({
  mode,
  name,
  description,
  color,
  busy,
  onClose,
  onSubmit,
  onNameChange,
  onDescriptionChange,
  onColorChange,
  pageColors
}: {
  mode: Exclude<ModalMode, null>;
  name: string;
  description: string;
  color: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onColorChange: (value: string) => void;
  pageColors: string[];
}) {
  const [hexInput, setHexInput] = useState(color.toUpperCase());

  useEffect(() => {
    setHexInput(color.toUpperCase());
  }, [color]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-lg rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="label mb-2">Coleção</p>
            <h2 className="text-xl font-bold text-ink">{mode === "create" ? "Criar coleção" : "Editar coleção"}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md border border-ink/10 text-ink/55 hover:text-ink" title="Fechar">
            <X size={17} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="label mb-2 block">Nome</span>
            <input className="field" value={name} onChange={(event) => onNameChange(event.target.value)} required />
          </label>

          <label className="block">
            <span className="label mb-2 block">Descrição (opcional)</span>
            <textarea className="field min-h-24" value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
          </label>

          <div>
            <span className="label mb-2 block">Cor da coleção</span>
            <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
              <input
                className="h-36 w-full cursor-pointer border-0 p-0"
                type="color"
                value={color}
                onChange={(event) => onColorChange(event.target.value)}
                title="Escolher cor"
              />
              <div
                className="h-3"
                style={{
                  background:
                    "linear-gradient(90deg, #ff2d2d, #ffb000, #fff500, #24d943, #16c7ff, #3038ff, #b229ff, #ff2d8a)"
                }}
              />
              <div className="space-y-3 p-3">
                <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm font-semibold text-ink/70">
                  HEX
                  <input
                    className="field"
                    value={hexInput}
                    onChange={(event) => {
                      const value = event.target.value.trim().toUpperCase();
                      setHexInput(value);
                      if (/^#[0-9A-F]{6}$/.test(value)) onColorChange(value);
                    }}
                    onBlur={() => {
                      if (!/^#[0-9A-F]{6}$/.test(hexInput)) setHexInput(color.toUpperCase());
                    }}
                  />
                </label>
                {pageColors.length ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-ink/55">Cores na página</p>
                    <div className="flex flex-wrap gap-2">
                      {pageColors.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onColorChange(option)}
                          className="h-7 w-7 rounded-full border-2 transition"
                          style={{
                            backgroundColor: option,
                            borderColor: color.toLowerCase() === option.toLowerCase() ? "#1d2320" : "transparent"
                          }}
                          title={option}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            Cancelar
          </button>
          <button disabled={busy} className="btn-primary">
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
