"use client";

import { FormEvent, useEffect, useState } from "react";
import { Camera, LogOut, Mail, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { planName } from "@/lib/billing/plans";
import { normalizePlanningPdfSkill, planningPdfSkills, type PlanningPdfSkillKey } from "@/lib/planning/pdf-skills";

export default function ProfilePage() {
  const router = useRouter();
  const { supabase, profile, usage, user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [planningSkill, setPlanningSkill] = useState<PlanningPdfSkillKey>("grade");
  const [showAllSkins, setShowAllSkins] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [skinMessage, setSkinMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [skinBusy, setSkinBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setName(profile?.name || "");
    setAvatarPreview(profile?.avatar_url || null);
    setPlanningSkill(normalizePlanningPdfSkill(profile?.planning_pdf_skill));
  }, [profile?.avatar_url, profile?.name, profile?.planning_pdf_skill]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setBusy(true);
    setMessage(null);
    try {
      let avatarUrl = profile?.avatar_url || null;

      if (avatarFile) {
        avatarUrl = await uploadAvatar(avatarFile);
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

  async function uploadAvatar(file: File) {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    const formData = new FormData();
    formData.append("avatar", file);
    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      body: formData
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Não foi possível enviar a foto.");
    }

    const data = (await response.json()) as { avatar_url: string };
    return data.avatar_url;
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword) {
      setPasswordMessage("Informe sua senha atual.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("As senhas não conferem.");
      return;
    }

    setPasswordBusy(true);
    setPasswordMessage(null);
    try {
      const email = profile?.email || user?.email;
      if (!email) {
        throw new Error("E-mail da conta não encontrado.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (signInError) throw signInError;

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      if (user) {
        const { error: profileError } = await supabase.from("profiles").update({ password_must_change: false }).eq("id", user.id);
        if (profileError) throw profileError;
        await refreshProfile();
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Senha atualizada.");
      setPasswordFormOpen(false);
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  function selectPlanningSkill(skill: PlanningPdfSkillKey) {
    setPlanningSkill(skill);
    setSkinMessage(null);
  }

  async function savePlanningSkill() {
    if (!user) return;
    setSkinBusy(true);
    setSkinMessage(null);
    try {
      const { error } = await supabase.from("profiles").update({ planning_pdf_skill: planningSkill }).eq("id", user.id);

      if (error) {
        setSkinMessage(formatPlanningSkillError(error.message));
        return;
      }

      await refreshProfile();
      setSkinMessage("Skin do planejamento atualizada.");
    } finally {
      setSkinBusy(false);
    }
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
            <Info label="Plano atual" value={usage?.plan_name || planName(profile?.plan)} />
            <Link href="/planos" className="rounded-lg border border-ink/10 bg-white p-4 transition hover:border-leaf/40">
              <p className="label">Upgrade</p>
              <p className="mt-1 text-sm font-bold text-leaf">Fazer upgrade do plano</p>
            </Link>
            <Info label="Uso do ciclo" value={`${usage?.generated_count || 0}/${usage?.activity_limit || 0} atividades geradas`} />
            <Info label="Vencimento" value={usage?.current_period_end ? new Date(usage.current_period_end).toLocaleDateString("pt-BR") : "-"} />
            <Info label="Acesso" value={profile?.is_admin ? "Admin" : "Usuário"} />
            <Info label="Data de cadastro" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "-"} />
          </div>

          <button onClick={handleSignOut} className="mt-5 w-full btn-secondary">
            <LogOut size={16} />
            Sair da conta
          </button>
        </section>

        <section className="space-y-5">
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

          <form onSubmit={updatePassword} className="panel h-fit space-y-4 p-5">
            <div>
              <p className="label mb-2">Segurança</p>
              <h2 className="text-lg font-bold text-ink">Alterar senha</h2>
              {profile?.password_must_change ? (
                <p className="mt-3 rounded-lg border border-sun/30 bg-sun/10 px-4 py-3 text-sm leading-6 text-ink/75">
                  Sua conta foi criada com a senha provisória. Defina uma nova senha para continuar usando o app com segurança.
                </p>
              ) : null}
            </div>

            {!passwordFormOpen ? (
              <button type="button" onClick={() => setPasswordFormOpen(true)} className="text-sm font-bold text-leaf underline underline-offset-4">
                Alterar senha
              </button>
            ) : (
              <>
                <div>
                  <label className="label mb-2 block">Senha atual</label>
                  <input className="field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={6} required />
                </div>
                <div>
                  <label className="label mb-2 block">Nova senha</label>
                  <input className="field" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={6} required />
                </div>
                <div>
                  <label className="label mb-2 block">Confirmar nova senha</label>
                  <input className="field" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={6} required />
                </div>
              </>
            )}

            {passwordMessage ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{passwordMessage}</p> : null}

            {passwordFormOpen ? (
              <div className="flex flex-wrap gap-2">
                <button disabled={passwordBusy} className="btn-primary">
                  <Save size={16} />
                  Salvar senha
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordFormOpen(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordMessage(null);
                  }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </form>

          <section className="panel h-fit space-y-4 p-5">
            <div>
              <p className="label mb-2">Skins do planejamento</p>
              <h2 className="text-lg font-bold text-ink">Modelo do PDF</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Escolha a skin que será aplicada quando baixar o PDF do planejamento.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(showAllSkins ? planningPdfSkills : planningPdfSkills.slice(0, 3)).map((skill) => {
                const active = planningSkill === skill.key;
                return (
                  <button
                    key={skill.key}
                    type="button"
                    onClick={() => selectPlanningSkill(skill.key)}
                    className={`overflow-hidden rounded-lg border bg-white p-2 text-left transition ${
                      active ? "border-leaf ring-2 ring-leaf/15" : "border-ink/10 hover:border-leaf/40"
                    }`}
                    title={skill.name}
                    aria-label={`Selecionar skin ${skill.name}`}
                  >
                    {skill.previewImage ? (
                      <img src={skill.previewImage} alt={skill.name} className="aspect-[4/3] w-full rounded-md object-cover" />
                    ) : (
                      <span className="grid aspect-[4/3] w-full place-items-center rounded-md border border-ink/10 bg-paper p-3">
                        <span className="h-full w-full rounded border border-ink/10 bg-white shadow-inner" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {skinMessage ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{skinMessage}</p> : null}

            <div className="flex flex-wrap items-center gap-3">
              {planningPdfSkills.length > 3 ? (
                <button type="button" onClick={() => setShowAllSkins((current) => !current)} className="text-sm font-bold text-leaf underline underline-offset-4">
                  {showAllSkins ? "Ver menos" : "Ver mais"}
                </button>
              ) : null}

              <button type="button" disabled={skinBusy || planningSkill === normalizePlanningPdfSkill(profile?.planning_pdf_skill)} onClick={savePlanningSkill} className="btn-primary disabled:cursor-not-allowed disabled:opacity-55">
                <Save size={16} />
                Salvar skin
              </button>
            </div>
          </section>

          <section className="panel h-fit space-y-4 p-5">
            <div>
              <p className="label mb-2">Canal de contato</p>
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Mail size={18} className="text-leaf" />
                Suporte
              </h2>
            </div>
            <p className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm leading-6 text-ink/70">
              Para um atendimento mais efetivo, nos envie um e-mail para{" "}
              <a href="mailto:benmaprojetos@gmail.com" className="font-bold text-leaf underline underline-offset-4">
                benmaprojetos@gmail.com
              </a>{" "}
              com o seu e-mail de cadastro no assunto.
              <br />
              *Nosso prazo de retorno é de até 48h úteis.
            </p>
          </section>
        </section>
      </div>
    </ProtectedPage>
  );
}

function formatPlanningSkillError(message: string) {
  if (message.includes("planning_pdf_skill")) {
    return "A coluna planning_pdf_skill ainda não existe no Supabase. Rode a migration de skins do planejamento e tente novamente.";
  }

  return message;
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
