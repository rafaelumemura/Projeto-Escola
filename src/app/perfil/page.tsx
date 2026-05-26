"use client";

import { FormEvent, useEffect, useState } from "react";
import { Camera, LogOut, Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import type { BillingUsage } from "@/lib/billing/plans";

export default function ProfilePage() {
  const router = useRouter();
  const { supabase, profile, user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile?.name || "");
    setAvatarPreview(profile?.avatar_url || null);
  }, [profile?.avatar_url, profile?.name]);

  useEffect(() => {
    apiFetch<{ usage: BillingUsage }>(supabase, "/api/billing/usage")
      .then((data) => setUsage(data.usage))
      .catch(() => setUsage(null));
  }, [supabase]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setBusy(true);
    setMessage(null);
    try {
      let avatarUrl = profile?.avatar_url || null;

      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, {
          cacheControl: "3600",
          contentType: avatarFile.type,
          upsert: true
        });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }

      const { error } = await supabase.from("profiles").update({ name, avatar_url: avatarUrl }).eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setAvatarFile(null);
      setMessage("Perfil atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  function selectAvatar(file?: File) {
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <ProtectedPage title="Perfil" subtitle="Gerencie seus dados de conta e plano atual.">
      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <section className="panel p-5">
          <div className="mb-5 flex items-center gap-3">
            <AvatarPreview src={avatarPreview} name={profile?.name || user?.email || "Perfil"} />
            <div>
              <h2 className="text-lg font-bold">{profile?.name || "Professor(a)"}</h2>
              <p className="text-sm text-ink/60">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <Info label="E-mail" value={profile?.email || user?.email || "-"} />
            <Info label="Plano atual" value={usage?.plan_name || profile?.plan || "Sem plano"} />
            <Info label="Uso do ciclo" value={`${usage?.generated_count || 0}/${usage?.activity_limit || 0} atividades`} />
            <Info label="Vencimento" value={usage?.current_period_end ? new Date(usage.current_period_end).toLocaleDateString("pt-BR") : "-"} />
            <Info label="Data de cadastro" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "-"} />
          </div>

          <button onClick={handleSignOut} className="mt-5 w-full btn-secondary">
            <LogOut size={16} />
            Sair da conta
          </button>
        </section>

        <form onSubmit={saveProfile} className="panel h-fit space-y-4 p-5">
          <div>
            <span className="label mb-2 block">Foto</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ink/20 bg-white p-4 transition hover:border-leaf/40">
              <AvatarPreview src={avatarPreview} name={name || profile?.email || "Perfil"} compact />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Camera size={16} />
                  Alterar foto
                </span>
                <span className="mt-1 block text-xs text-ink/55">JPG, PNG, WEBP ou GIF até 5 MB</span>
              </span>
              <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => selectAvatar(event.target.files?.[0])} />
            </label>
          </div>

          <div>
            <label className="label mb-2 block">Nome</label>
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>

          {message ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{message}</p> : null}

          <button disabled={busy} className="btn-primary">
            <Save size={16} />
            Salvar perfil
          </button>
        </form>
      </div>
    </ProtectedPage>
  );
}

function AvatarPreview({ src, name, compact = false }: { src?: string | null; name: string; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const size = compact ? "h-14 w-14" : "h-14 w-14";

  if (src) {
    return <img src={src} alt={name} className={`${size} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-mint text-leaf`}>
      {initials || <UserRound size={24} />}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
