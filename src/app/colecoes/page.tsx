"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Eye, FolderKanban, Pencil, Plus, Trash2, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { ActivityView } from "@/components/ui/ActivityView";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type Collection = Database["public"]["Tables"]["collections"]["Row"];
type CollectionCard = Collection & { activity_count?: number };
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ModalMode = "create" | "edit" | null;

const defaultCollectionColor = "#2f7d58";

export default function CollectionsPage() {
  const { supabase } = useAuth();
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
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState(false);
  const [confirmRemoveActivityId, setConfirmRemoveActivityId] = useState<string | null>(null);
  const [movingActivityId, setMovingActivityId] = useState<string | null>(null);
  const [moveTargetCollectionId, setMoveTargetCollectionId] = useState("");
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pageColors = Array.from(
    new Set(collections.map((collection) => collection.color).filter((item): item is string => Boolean(item)))
  );

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
      setConfirmDeleteCollection(false);
      setConfirmRemoveActivityId(null);
      setMovingActivityId(null);
      setMoveTargetCollectionId("");
      loadCollectionDetails(selected.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function openCreateModal() {
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

  async function deleteCollection() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      setCollectionActivities([]);
      setConfirmDeleteCollection(false);
      await loadCollections();
      setMessage("Coleção excluída.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setBusy(false);
    }
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

  async function removeActivity(id: string) {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${selected.id}/activities/${id}`, { method: "DELETE" });
      setConfirmRemoveActivityId(null);
      await loadCollectionDetails(selected.id);
      await loadCollections();
      setMessage("Atividade removida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
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
        <button type="button" onClick={openCreateModal} className="btn-primary">
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
            <span className="badge">{collections.length} coleções</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => (
              <div
                key={collection.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(collection)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelected(collection);
                }}
                style={{
                  borderTopColor: collection.color || defaultCollectionColor,
                  borderBottomColor: collection.color || defaultCollectionColor,
                  boxShadow: selected?.id === collection.id ? `0 0 0 2px ${collection.color || defaultCollectionColor}22` : undefined
                }}
                className="panel block min-h-[180px] border-x-0 border-y-[8px] p-5 text-left transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-leaf">
                    <FolderKanban size={22} />
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
                  </div>
                </div>
                <h2 className="mt-5 text-lg font-bold text-ink">{collection.name}</h2>
                <p className="mt-2 min-h-10 text-sm leading-5 text-ink/60">{collection.description || "Sem descrição"}</p>
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
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold">
                    <Eye size={18} className="text-leaf" />
                    Atividades da coleção: {selected.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge">{collectionActivities.length} itens</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (confirmDeleteCollection) {
                          deleteCollection();
                        } else {
                          setConfirmDeleteCollection(true);
                        }
                      }}
                      className="btn-danger"
                    >
                      <Trash2 size={16} />
                      {confirmDeleteCollection ? "Confirmar exclusão" : "Excluir"}
                    </button>
                  </div>
                </div>

                <div className="mb-4 flex gap-2">
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
                      className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 text-left transition hover:border-leaf/35 lg:grid-cols-[1fr_360px_auto]"
                    >
                      <div className="min-w-0">
                        <h3 className="font-bold">{activity.title}</h3>
                        <p className="mt-1 text-sm text-ink/60">{activity.age_range || "Faixa etária"} • {activity.development_area || "Área"}</p>
                      </div>
                      <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
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
                            <button type="button" disabled={busy} onClick={cancelMoveActivity} className="btn-secondary px-3" title="Cancelar mudança">
                              <X size={17} />
                            </button>
                            <button type="button" disabled={busy} onClick={() => saveMoveActivity(activity.id)} className="btn-secondary px-3" title="Salvar mudança">
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
                          if (confirmRemoveActivityId === activity.id) {
                            removeActivity(activity.id);
                          } else {
                            setConfirmRemoveActivityId(activity.id);
                          }
                        }}
                        className={confirmRemoveActivityId === activity.id ? "btn-danger px-3" : "btn-secondary px-3"}
                        title="Remover da coleção"
                      >
                        {confirmRemoveActivityId === activity.id ? "Confirmar" : <X size={17} />}
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-6">
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
