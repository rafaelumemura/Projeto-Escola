"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, FolderPlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";

type Collection = Database["public"]["Tables"]["collections"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];

export default function CollectionsPage() {
  const { supabase } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [collectionActivities, setCollectionActivities] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [activityId, setActivityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadCollections() {
    const data = await apiFetch<{ collections: Collection[] }>(supabase, "/api/collections");
    setCollections(data.collections);
    setSelected((current) => current || data.collections[0] || null);
  }

  async function loadCollectionDetails(collectionId: string) {
    const data = await apiFetch<{ collection: Collection; activities: Activity[] }>(supabase, `/api/collections/${collectionId}`);
    setSelected(data.collection);
    setEditName(data.collection.name);
    setEditDescription(data.collection.description || "");
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
      loadCollectionDetails(selected.id).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ collection: Collection }>(supabase, "/api/collections", {
        method: "POST",
        body: { name, description: description || null }
      });
      setName("");
      setDescription("");
      setSelected(data.collection);
      await loadCollections();
      setMessage("Coleção criada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiFetch<{ collection: Collection }>(supabase, `/api/collections/${selected.id}`, {
        method: "PUT",
        body: { name: editName, description: editDescription || null }
      });
      setSelected(data.collection);
      await loadCollections();
      setMessage("Coleção atualizada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCollection() {
    if (!selected || !window.confirm("Excluir esta coleção? As atividades não serão excluídas.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(supabase, `/api/collections/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      setCollectionActivities([]);
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
      await loadCollectionDetails(selected.id);
      setMessage("Atividade removida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProtectedPage title="Coleções" subtitle="Crie grupos temáticos para reaproveitar atividades em projetos, datas e objetivos pedagógicos.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <form onSubmit={createCollection} className="panel space-y-3 p-4">
            <div className="flex items-center gap-2 font-bold">
              <FolderPlus size={18} className="text-leaf" />
              Nova coleção
            </div>
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Semana da Natureza" required />
            <textarea className="field min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição opcional" />
            <button disabled={busy} className="w-full btn-primary">
              <Plus size={16} />
              Criar coleção
            </button>
          </form>

          <div className="space-y-2">
            {collections.map((collection) => (
              <button
                key={collection.id}
                onClick={() => setSelected(collection)}
                className={`w-full rounded-lg border bg-white p-4 text-left transition ${
                  selected?.id === collection.id ? "border-leaf ring-2 ring-leaf/15" : "border-ink/10 hover:border-leaf/40"
                }`}
              >
                <h2 className="font-bold">{collection.name}</h2>
                <p className="mt-1 text-sm text-ink/60">{collection.description || "Sem descrição"}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          {selected ? (
            <>
              <form onSubmit={updateCollection} className="panel space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold">
                    <Pencil size={18} className="text-leaf" />
                    Editar coleção
                  </div>
                  <button type="button" disabled={busy} onClick={deleteCollection} className="btn-danger">
                    <Trash2 size={16} />
                    Excluir
                  </button>
                </div>
                <input className="field" value={editName} onChange={(event) => setEditName(event.target.value)} required />
                <textarea className="field min-h-20" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                <button disabled={busy} className="btn-primary">
                  <Save size={16} />
                  Salvar coleção
                </button>
              </form>

              <div className="panel p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold">
                    <Eye size={18} className="text-leaf" />
                    Atividades da coleção
                  </div>
                  <span className="badge">{collectionActivities.length} itens</span>
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
                    <div key={activity.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink/10 bg-white p-4">
                      <div>
                        <h3 className="font-bold">{activity.title}</h3>
                        <p className="mt-1 text-sm text-ink/60">{activity.age_range || "Faixa etária"} • {activity.development_area || "Área"}</p>
                      </div>
                      <button disabled={busy} onClick={() => removeActivity(activity.id)} className="btn-secondary px-3" title="Remover">
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
    </ProtectedPage>
  );
}
