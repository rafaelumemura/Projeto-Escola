"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Camera, Check, CreditCard, LogOut, Mail, Moon, Palette, Save, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeAccent, ThemeMode } from "@/components/theme/ThemeProvider";
import { apiFetch } from "@/lib/api/client";
import { PLAN_DEFINITIONS, canUsePlanningSkins, planName, type PaidPlanKey } from "@/lib/billing/plans";
import { normalizePlanningPdfSkill, planningPdfSkills, type PlanningPdfSkillKey } from "@/lib/planning/pdf-skills";

type AccessRole = "admin" | "user";
type ProfileTab = "personal" | "account" | "theme";

const ownerEmail = "rafaelumemura@gmail.com";
const planOptions = Object.values(PLAN_DEFINITIONS);

export default function ProfilePage() {
  const router = useRouter();
  const { supabase, profile, usage, user, refreshProfile, refreshUsage, signOut } = useAuth();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const [activeTab, setActiveTab] = useState<ProfileTab>("personal");
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [planningSkill, setPlanningSkill] = useState<PlanningPdfSkillKey>("grade");
  const [accessRole, setAccessRole] = useState<AccessRole>("user");
  const [accessPlan, setAccessPlan] = useState<PaidPlanKey>("free");
  const [showAllSkins, setShowAllSkins] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [skinMessage, setSkinMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [skinBusy, setSkinBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const canManageOwnAccess = (profile?.email || user?.email || "").toLowerCase() === ownerEmail;
  const planningSkinsEnabled = canUsePlanningSkins(usage?.plan_key || profile?.plan);
  const savedPlanningSkill = normalizePlanningPdfSkill(profile?.planning_pdf_skill);
  const orderedPlanningSkills = useMemo(() => {
    const saved = planningPdfSkills.find((skill) => skill.key === savedPlanningSkill);
    return saved ? [saved, ...planningPdfSkills.filter((skill) => skill.key !== saved.key)] : planningPdfSkills;
  }, [savedPlanningSkill]);
  const visiblePlanningSkills = showAllSkins ? orderedPlanningSkills : orderedPlanningSkills.slice(0, 3);

  useEffect(() => {
    setName(profile?.name || "");
    setAvatarPreview(profile?.avatar_url || null);
    setPlanningSkill(normalizePlanningPdfSkill(profile?.planning_pdf_skill));
  }, [profile?.avatar_url, profile?.name, profile?.planning_pdf_skill]);

  useEffect(() => {
    setAccessRole(profile?.is_admin ? "admin" : "user");
    const currentPlan = usage?.plan_key || profile?.plan;
    if (isPaidPlanKey(currentPlan)) {
      setAccessPlan(currentPlan);
    }
  }, [profile?.is_admin, profile?.plan, usage?.plan_key]);

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
      if (user) {
        await apiFetch(supabase, "/api/profile/password-changed", {
          method: "POST",
          body: {
            current_password: currentPassword,
            new_password: newPassword
          }
        });
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
    if (!planningSkinsEnabled) {
      setSkinMessage("Skins do planejamento estão disponíveis somente nos planos Completo e Pro.");
      return;
    }

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

  async function saveAccessSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageOwnAccess) return;

    setAccessBusy(true);
    setAccessMessage(null);
    try {
      await apiFetch(supabase, "/api/admin/profile-access", {
        method: "PUT",
        body: {
          access: accessRole,
          plan_key: accessPlan
        }
      });
      await Promise.all([refreshProfile(), refreshUsage()]);
      setAccessMessage("Acesso e plano atualizados.");
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Não foi possível atualizar o acesso.");
    } finally {
      setAccessBusy(false);
    }
  }

  return (
    <ProtectedPage title="Perfil" subtitle="Gerencie seus dados de conta e plano atual.">
      <nav className="panel mb-5 grid grid-cols-1 gap-1 p-1.5 sm:grid-cols-3" aria-label="Seções do perfil">
        <ProfileTabButton active={activeTab === "personal"} icon={<UserRound size={17} />} onClick={() => setActiveTab("personal")}>
          Informações pessoais
        </ProfileTabButton>
        <ProfileTabButton active={activeTab === "account"} icon={<CreditCard size={17} />} onClick={() => setActiveTab("account")}>
          Informações da conta
        </ProfileTabButton>
        <ProfileTabButton active={activeTab === "theme"} icon={<Palette size={17} />} onClick={() => setActiveTab("theme")}>
          Tema
        </ProfileTabButton>
      </nav>

      <div className="space-y-5">
        <section className={activeTab === "account" ? "panel p-5" : "hidden"}>
          <div className="mb-5 flex items-center gap-3">
            <AvatarPreview src={avatarPreview} name={profile?.name || user?.email || "Perfil"} />
            <div>
              <h2 className="text-lg font-bold">{profile?.name || "Professor(a)"}</h2>
              <p className="text-sm text-ink/60">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="grid gap-3">
            <Info label="E-mail" value={profile?.email || user?.email || "-"} />
            <PlanInfo value={usage?.plan_name || planName(profile?.plan)} planKey={usage?.plan_key || profile?.plan} />
            {canManageOwnAccess ? (
              <OwnerAccessPanel
                accessPlan={accessPlan}
                accessRole={accessRole}
                busy={accessBusy}
                message={accessMessage}
                onAccessPlanChange={setAccessPlan}
                onAccessRoleChange={setAccessRole}
                onSubmit={saveAccessSettings}
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <UsageTag label="Uso do ciclo" used={usage?.generated_count || 0} limit={usage?.activity_limit || 0} suffix="atividades geradas" />
              <UsageTag
                label="Material gerado"
                used={usage?.printable_material_generated_count || 0}
                limit={usage?.printable_material_limit || 0}
                suffix="materiais gerados"
                unavailable={!usage?.printable_material_enabled}
              />
            </div>
            <Info label="Vencimento" value={usage?.current_period_end ? new Date(usage.current_period_end).toLocaleDateString("pt-BR") : "-"} />
            <Info label="Acesso" value={profile?.is_admin ? "Admin" : "Usuário"} />
            <Info label="Data de cadastro" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "-"} />
          </div>

          <button onClick={handleSignOut} className="mt-5 w-full btn-secondary">
            <LogOut size={16} />
            Sair da conta
          </button>
        </section>

        <section className="grid items-start gap-5 lg:grid-cols-2">
          <form onSubmit={saveProfile} className={activeTab === "personal" ? "panel h-fit space-y-4 p-5" : "hidden"}>
            <div>
              <p className="label mb-2">Informações pessoais</p>
              <h2 className="text-lg font-bold text-ink">Seu perfil</h2>
            </div>
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

          <section className={activeTab === "account" ? "panel h-fit space-y-4 p-5 lg:col-span-2" : "hidden"}>
            <div>
              <p className="label mb-2">Skins do planejamento</p>
              <h2 className="text-lg font-bold text-ink">Modelo do PDF</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                {planningSkinsEnabled
                  ? "Escolha a skin que será aplicada quando baixar o PDF do planejamento."
                  : "Disponível somente nos planos Completo e Pro."}
              </p>
            </div>

            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${planningSkinsEnabled ? "" : "opacity-45"}`}>
              {visiblePlanningSkills.map((skill) => {
                const active = planningSkill === skill.key;
                const saved = savedPlanningSkill === skill.key;
                return (
                  <button
                    key={skill.key}
                    type="button"
                    disabled={!planningSkinsEnabled}
                    onClick={() => selectPlanningSkill(skill.key)}
                    className={`relative overflow-hidden rounded-lg border bg-white p-2 text-left transition ${
                      active ? "border-leaf ring-2 ring-leaf/20" : "border-ink/10 hover:border-leaf/40"
                    } disabled:cursor-not-allowed`}
                    title={skill.name}
                    aria-label={`Selecionar skin ${skill.name}`}
                    aria-pressed={active}
                  >
                    {saved ? (
                      <span className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-leaf text-white shadow" title="Modelo salvo">
                        <Check size={16} strokeWidth={3} />
                      </span>
                    ) : null}
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
                <button type="button" disabled={!planningSkinsEnabled} onClick={() => setShowAllSkins((current) => !current)} className="text-sm font-bold text-leaf underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45">
                  {showAllSkins ? "Ver menos" : "Ver mais"}
                </button>
              ) : null}

              <button type="button" disabled={!planningSkinsEnabled || skinBusy || planningSkill === savedPlanningSkill} onClick={savePlanningSkill} className="btn-primary disabled:cursor-not-allowed disabled:opacity-55">
                <Save size={16} />
                Salvar skin
              </button>
            </div>
          </section>

          <form onSubmit={updatePassword} className={activeTab === "personal" ? "panel h-fit space-y-4 p-5" : "hidden"}>
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

          <section className={activeTab === "personal" ? "panel h-fit space-y-4 p-5 lg:col-span-2" : "hidden"}>
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
              <br />
              <br />
              Ou se preferir, entre em contato conosco pelo WhatsApp através do número{" "}
              <a
                href="https://wa.me/5511962751539"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-leaf underline underline-offset-4"
              >
                (11) 96275-1539
              </a>{" "}
              (Obs: Apenas mensagens de texto)
            </p>
          </section>

          <section className={activeTab === "theme" ? "panel h-fit space-y-5 p-5 lg:col-span-2" : "hidden"}>
            <div>
              <p className="label mb-2">Personalização</p>
              <h2 className="text-lg font-bold text-ink">Aparência do app</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">Escolha o modo de fundo e uma cor de destaque inspirada no logotipo do Projeto Escola.</p>
            </div>
            <ThemeSelector theme={theme} accent={accent} onThemeChange={setTheme} onAccentChange={setAccent} />
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

function ProfileTabButton({ active, children, icon, onClick }: { active: boolean; children: ReactNode; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition ${
        active ? "bg-mint text-leaf" : "text-ink/60 hover:bg-mint/45 hover:text-leaf"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {children}
    </button>
  );
}

function UsageTag({
  label,
  used,
  limit,
  suffix,
  unavailable = false
}: {
  label: string;
  used: number;
  limit: number;
  suffix: string;
  unavailable?: boolean;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const colorClass =
    percent <= 40
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : percent <= 70
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label">{label}</p>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${colorClass}`}>
          {used}/{limit} {suffix}
        </span>
      </div>
      {unavailable ? <p className="mt-2 text-xs text-ink/55">Disponível no plano Completo.</p> : <p className="mt-2 text-xs font-semibold text-ink/55">{percent}% utilizado</p>}
    </div>
  );
}

function OwnerAccessPanel({
  accessPlan,
  accessRole,
  busy,
  message,
  onAccessPlanChange,
  onAccessRoleChange,
  onSubmit
}: {
  accessPlan: PaidPlanKey;
  accessRole: AccessRole;
  busy: boolean;
  message: string | null;
  onAccessPlanChange: (plan: PaidPlanKey) => void;
  onAccessRoleChange: (role: AccessRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="label">Controle especial</p>
      <p className="mt-1 text-xs leading-5 text-ink/55">
        Visível somente para rafaelumemura@gmail.com.
      </p>

      <div className="mt-3 grid gap-3">
        <label className="block">
          <span className="label mb-2 block">Acesso</span>
          <select className="field" value={accessRole} onChange={(event) => onAccessRoleChange(event.target.value as AccessRole)}>
            <option value="admin">Admin</option>
            <option value="user">Usuário</option>
          </select>
        </label>

        <label className="block">
          <span className="label mb-2 block">Plano atual</span>
          <select className="field" value={accessPlan} onChange={(event) => onAccessPlanChange(event.target.value as PaidPlanKey)}>
            {planOptions.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? <p className="mt-3 rounded-md bg-mint px-3 py-2 text-sm text-ink/75">{message}</p> : null}

      <button disabled={busy} className="mt-3 w-full btn-primary">
        <Save size={16} />
        Salvar acesso
      </button>
    </form>
  );
}

function PlanInfo({ value, planKey }: { value: string; planKey?: string | null }) {
  const canUpgrade = planKey === "free" || planKey === "basic";

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="label">Plano atual</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{value}</p>
        {canUpgrade ? (
          <Link href="/planos" className="btn-primary px-3 py-1.5 text-xs">
            Fazer upgrade
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function isPaidPlanKey(value: unknown): value is PaidPlanKey {
  return typeof value === "string" && value in PLAN_DEFINITIONS;
}

const themeAccentOptions: Array<{ key: ThemeAccent; name: string; color: string }> = [
  { key: "teal", name: "Turquesa", color: "#00b3af" },
  { key: "blue", name: "Azul", color: "#2f80ed" },
  { key: "coral", name: "Coral", color: "#ff4f64" },
  { key: "amber", name: "Âmbar", color: "#c98117" },
  { key: "purple", name: "Lilás", color: "#7e57c2" },
  { key: "green", name: "Verde", color: "#2f7d58" }
];

function ThemeSelector({
  theme,
  accent,
  onThemeChange,
  onAccentChange
}: {
  theme: ThemeMode;
  accent: ThemeAccent;
  onThemeChange: (theme: ThemeMode) => void;
  onAccentChange: (accent: ThemeAccent) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Modo de fundo</p>
        <div className="mt-3 grid max-w-md grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onThemeChange("light")}
            className={`flex h-14 items-center justify-center gap-2 rounded-md border text-sm font-bold transition ${
              theme === "light" ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/60 hover:border-leaf/35 hover:text-leaf"
            }`}
            title="Modo claro"
            aria-label="Ativar modo claro"
            aria-pressed={theme === "light"}
          >
            <Sun size={20} />
            Claro
          </button>
          <button
            type="button"
            onClick={() => onThemeChange("dark")}
            className={`flex h-14 items-center justify-center gap-2 rounded-md border text-sm font-bold transition ${
              theme === "dark" ? "border-leaf bg-mint text-leaf" : "border-ink/10 bg-white text-ink/60 hover:border-leaf/35 hover:text-leaf"
            }`}
            title="Modo escuro"
            aria-label="Ativar modo escuro"
            aria-pressed={theme === "dark"}
          >
            <Moon size={20} />
            Escuro
          </button>
        </div>
      </div>

      <div className="border-t border-ink/10 pt-5">
        <p className="label">Cor de destaque</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {themeAccentOptions.map((option) => {
            const active = accent === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onAccentChange(option.key)}
                className={`flex min-w-24 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  active ? "border-leaf bg-mint text-ink ring-2 ring-leaf/15" : "border-ink/10 bg-white text-ink/65 hover:border-ink/25"
                }`}
                aria-label={`Usar destaque ${option.name}`}
                aria-pressed={active}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: option.color }}>
                  {active ? <Check size={14} className="text-white" strokeWidth={3} /> : null}
                </span>
                {option.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
