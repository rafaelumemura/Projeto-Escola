"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, CheckCircle2, KeyRound, RefreshCw, Save, Search, ShieldCheck, UsersRound } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";

type AdminTab = "plans" | "keys" | "subscribers";
type PlanKey = "free" | "basic" | "complete" | "pro";

type PlanConfiguration = {
  plan_key: PlanKey;
  activity_limit: number;
  collection_limit: number | null;
  printable_material_limit: number;
  period_days: number;
  printable_material_enabled: boolean;
  planning_skins_enabled: boolean;
  updated_at: string;
};

type ApiKeyStatus = {
  key: "anthropic_api_key" | "openai_api_key" | "image_generation_api_key";
  label: string;
  configured: boolean;
  source: "panel" | "environment" | "missing";
  updated_at: string | null;
};

type Subscriber = {
  id: string;
  name: string | null;
  email: string | null;
  is_admin: boolean;
  registered_at: string;
  adhered_at: string;
  plan_key: PlanKey;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  generated_count: number;
  activity_limit: number;
  printable_generated_count: number;
  printable_material_limit: number;
  collection_count: number;
  collection_limit: number | null;
};

const planNames: Record<PlanKey, string> = {
  free: "Gratuito",
  basic: "Básico",
  complete: "Completo",
  pro: "Pro"
};

export default function AdminPage() {
  const { profile, supabase, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("plans");
  const [plans, setPlans] = useState<PlanConfiguration[]>([]);
  const [apiStatuses, setApiStatuses] = useState<ApiKeyStatus[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<ApiKeyStatus["key"], string>>({
    anthropic_api_key: "",
    openai_api_key: "",
    image_generation_api_key: ""
  });
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subscribers;
    return subscribers.filter((subscriber) =>
      [subscriber.name, subscriber.email, planNames[subscriber.plan_key], subscriber.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, subscribers]);
  const activeSubscribers = subscribers.filter((subscriber) => subscriber.status === "active").length;
  const totalGenerated = subscribers.reduce((total, subscriber) => total + subscriber.generated_count, 0);

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.is_admin) {
      setLoading(false);
      return;
    }
    void loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.is_admin, supabase]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function loadAdminData() {
    setLoading(true);
    try {
      const [settings, subscriberData] = await Promise.all([
        apiFetch<{ plans: PlanConfiguration[]; api_keys: ApiKeyStatus[] }>(supabase, "/api/admin/settings"),
        apiFetch<{ subscribers: Subscriber[] }>(supabase, "/api/admin/subscribers")
      ]);
      setPlans(settings.plans);
      setApiStatuses(settings.api_keys);
      setSubscribers(subscriberData.subscribers);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar o painel administrativo.");
    } finally {
      setLoading(false);
    }
  }

  function updatePlan<K extends keyof PlanConfiguration>(planKey: PlanKey, field: K, value: PlanConfiguration[K]) {
    setPlans((current) => current.map((plan) => plan.plan_key === planKey ? { ...plan, [field]: value } : plan));
  }

  async function saveSettings() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ plans: PlanConfiguration[]; api_keys: ApiKeyStatus[] }>(supabase, "/api/admin/settings", {
        method: "PUT",
        body: {
          plans: plans.map(({ plan_key, activity_limit, collection_limit, printable_material_limit, period_days, printable_material_enabled, planning_skins_enabled }) => ({
            plan_key,
            activity_limit,
            collection_limit,
            printable_material_limit,
            period_days,
            printable_material_enabled,
            planning_skins_enabled
          })),
          api_keys: apiKeys
        }
      });
      setPlans(result.plans);
      setApiStatuses(result.api_keys);
      setApiKeys({ anthropic_api_key: "", openai_api_key: "", image_generation_api_key: "" });
      window.dispatchEvent(new Event("billing-usage-changed"));
      setMessage("Configurações aplicadas a todos os usuários.");
      const subscriberData = await apiFetch<{ subscribers: Subscriber[] }>(supabase, "/api/admin/subscribers");
      setSubscribers(subscriberData.subscribers);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setBusy(false);
    }
  }

  if (!profile?.is_admin && !loading && !authLoading) {
    return (
      <ProtectedPage title="Painel administrativo" subtitle="Configurações globais do Projeto Escola.">
        <div className="panel p-8 text-center">
          <ShieldCheck size={30} className="mx-auto text-ink/30" />
          <h2 className="mt-3 text-lg font-bold text-ink">Acesso restrito</h2>
          <p className="mt-2 text-sm text-ink/60">Este painel está disponível apenas para administradores.</p>
        </div>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage title="Painel administrativo" subtitle="Gerencie integrações, limites globais e assinantes do Projeto Escola.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      {loading ? (
        <div className="panel p-8 text-center text-sm font-semibold text-ink/55">Carregando configurações...</div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <AdminMetric icon={<UsersRound size={19} />} label="Assinantes cadastrados" value={subscribers.length} />
            <AdminMetric icon={<CheckCircle2 size={19} />} label="Acessos ativos" value={activeSubscribers} />
            <AdminMetric icon={<Activity size={19} />} label="Atividades consumidas" value={totalGenerated} />
          </section>

          <nav className="flex gap-1 overflow-x-auto rounded-lg bg-ink/5 p-1" aria-label="Áreas administrativas">
            <AdminTabButton active={activeTab === "plans"} onClick={() => setActiveTab("plans")}>Planos e limites</AdminTabButton>
            <AdminTabButton active={activeTab === "keys"} onClick={() => setActiveTab("keys")}>Chaves de API</AdminTabButton>
            <AdminTabButton active={activeTab === "subscribers"} onClick={() => setActiveTab("subscribers")}>Assinantes</AdminTabButton>
          </nav>

          {activeTab === "plans" ? (
            <section className="panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink">Limites dos planos</h2>
                  <p className="mt-1 text-sm text-ink/55">Alterações afetam assinaturas atuais e novas ativações.</p>
                </div>
                <button type="button" onClick={() => void saveSettings()} disabled={busy} className="btn-primary">
                  <Save size={16} />
                  {busy ? "Salvando..." : "Salvar limites"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead className="bg-paper text-xs uppercase text-ink/50">
                    <tr>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Atividades</th>
                      <th className="px-4 py-3">Coleções</th>
                      <th className="px-4 py-3">Materiais</th>
                      <th className="px-4 py-3">Dias do ciclo</th>
                      <th className="px-4 py-3">Material IA</th>
                      <th className="px-4 py-3">Skins</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {plans.map((plan) => (
                      <tr key={plan.plan_key}>
                        <td className="px-4 py-4 font-bold text-ink">{planNames[plan.plan_key]}</td>
                        <td className="px-4 py-4"><NumberInput value={plan.activity_limit} onChange={(value) => updatePlan(plan.plan_key, "activity_limit", value)} /></td>
                        <td className="px-4 py-4"><NullableNumberInput value={plan.collection_limit} onChange={(value) => updatePlan(plan.plan_key, "collection_limit", value)} /></td>
                        <td className="px-4 py-4"><NumberInput value={plan.printable_material_limit} onChange={(value) => updatePlan(plan.plan_key, "printable_material_limit", value)} /></td>
                        <td className="px-4 py-4"><NumberInput value={plan.period_days} min={1} onChange={(value) => updatePlan(plan.plan_key, "period_days", value)} /></td>
                        <td className="px-4 py-4"><Toggle checked={plan.printable_material_enabled} onChange={(value) => updatePlan(plan.plan_key, "printable_material_enabled", value)} label="Material imprimível" /></td>
                        <td className="px-4 py-4"><Toggle checked={plan.planning_skins_enabled} onChange={(value) => updatePlan(plan.plan_key, "planning_skins_enabled", value)} label="Skins do planejamento" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === "keys" ? (
            <section className="panel p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink">Integrações de IA</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/55">As chaves são criptografadas no servidor e nunca são devolvidas ao navegador. Deixe um campo vazio para manter a chave atual.</p>
                </div>
                <button type="button" onClick={() => void saveSettings()} disabled={busy} className="btn-primary">
                  <KeyRound size={16} />
                  {busy ? "Salvando..." : "Salvar chaves"}
                </button>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {apiStatuses.map((status) => (
                  <label key={status.key} className="rounded-lg border border-ink/10 p-4">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-bold text-ink">{status.label}</span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status.configured ? "bg-mint text-leaf" : "bg-clay/10 text-clay"}`}>
                        {status.configured ? status.source === "panel" ? "Painel" : "Railway" : "Não configurada"}
                      </span>
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={apiKeys[status.key]}
                      onChange={(event) => setApiKeys((current) => ({ ...current, [status.key]: event.target.value }))}
                      className="input mt-4"
                      placeholder={status.configured ? "••••••••••••••••" : "Insira a chave"}
                    />
                    <span className="mt-2 block text-xs text-ink/45">
                      {status.updated_at ? `Atualizada em ${formatDateTime(status.updated_at)}` : "Usa a configuração do ambiente quando disponível."}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-5 rounded-lg border border-sun/35 bg-sun/10 px-4 py-3 text-xs leading-5 text-ink/65">
                As chaves do Supabase e a chave de criptografia permanecem nas variáveis da Railway por segurança estrutural.
              </p>
            </section>
          ) : null}

          {activeTab === "subscribers" ? (
            <section className="panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-end sm:justify-between">
                <label className="block w-full max-w-md">
                  <span className="label mb-2 block">Buscar assinante</span>
                  <span className="relative block">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} className="input pl-10" placeholder="Nome, e-mail, plano ou status" />
                  </span>
                </label>
                <button type="button" onClick={() => void loadAdminData()} className="btn-secondary"><RefreshCw size={16} />Atualizar</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-left">
                  <thead className="bg-paper text-xs uppercase text-ink/50">
                    <tr>
                      <th className="px-4 py-3">Assinante</th>
                      <th className="px-4 py-3">Adesão</th>
                      <th className="px-4 py-3">Plano</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Atividades</th>
                      <th className="px-4 py-3">Materiais</th>
                      <th className="px-4 py-3">Coleções</th>
                      <th className="px-4 py-3">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {filteredSubscribers.map((subscriber) => (
                      <tr key={subscriber.id}>
                        <td className="px-4 py-4">
                          <p className="font-bold text-ink">{subscriber.name || "Sem nome"}{subscriber.is_admin ? " • Admin" : ""}</p>
                          <p className="mt-1 text-xs text-ink/50">{subscriber.email || "Sem e-mail"}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-ink/65">{formatDate(subscriber.adhered_at)}</td>
                        <td className="px-4 py-4"><span className="badge">{planNames[subscriber.plan_key]}</span></td>
                        <td className="px-4 py-4"><StatusBadge status={subscriber.status} /></td>
                        <td className="px-4 py-4"><UsageValue used={subscriber.generated_count} limit={subscriber.activity_limit} /></td>
                        <td className="px-4 py-4"><UsageValue used={subscriber.printable_generated_count} limit={subscriber.printable_material_limit} /></td>
                        <td className="px-4 py-4"><UsageValue used={subscriber.collection_count} limit={subscriber.collection_limit} /></td>
                        <td className="px-4 py-4 text-sm text-ink/65">{subscriber.current_period_end ? formatDate(subscriber.current_period_end) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredSubscribers.length ? <p className="p-8 text-center text-sm text-ink/55">Nenhum assinante encontrado.</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </ProtectedPage>
  );
}

function AdminMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="panel flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-leaf">{icon}</span><span><strong className="block text-2xl text-ink">{value}</strong><span className="text-xs font-semibold text-ink/50">{label}</span></span></div>;
}

function AdminTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-bold transition ${active ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"}`}>{children}</button>;
}

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (value: number) => void; min?: number }) {
  return <input type="number" min={min} max={100000} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))} className="input w-28 py-2" />;
}

function NullableNumberInput({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <input type="number" min={0} max={100000} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0))} className="input w-28 py-2" placeholder="Ilimitado" />;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-leaf" : "bg-ink/15"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} /></button>;
}

function UsageValue({ used, limit }: { used: number; limit: number | null }) {
  return <span className="text-sm font-bold text-ink">{used}/{limit === null ? "∞" : limit}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${active ? "bg-mint text-leaf" : status === "past_due" ? "bg-sun/20 text-amber-700" : "bg-clay/10 text-clay"}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "past_due") return "Pagamento pendente";
  if (status === "suspended") return "Suspenso";
  if (status === "canceled") return "Cancelado";
  return "Inativo";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
