"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogOut, Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";

export default function ProfilePage() {
  const router = useRouter();
  const { supabase, profile, user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(profile?.name || "");
  }, [profile?.name]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("profiles").update({ name }).eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setMessage("Perfil atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
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
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-mint text-leaf">
              <UserRound size={24} />
            </span>
            <div>
              <h2 className="text-lg font-bold">{profile?.name || "Professor(a)"}</h2>
              <p className="text-sm text-ink/60">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <Info label="E-mail" value={profile?.email || user?.email || "-"} />
            <Info label="Plano atual" value={profile?.plan || "free"} />
            <Info label="Data de cadastro" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "-"} />
          </div>

          <button onClick={handleSignOut} className="mt-5 w-full btn-secondary">
            <LogOut size={16} />
            Sair da conta
          </button>
        </section>

        <form onSubmit={saveProfile} className="panel h-fit space-y-4 p-5">
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="label">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
