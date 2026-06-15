"use client";

import { useEffect, useState } from "react";
import { Check, Crown } from "lucide-react";
import { ProtectedPage } from "@/components/layout/ProtectedPage";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { PLAN_DEFINITIONS, type BillingUsage, type PaidPlanKey } from "@/lib/billing/plans";

const plans = [PLAN_DEFINITIONS.basic, PLAN_DEFINITIONS.complete];
const planPrices: Record<(typeof plans)[number]["key"], string> = {
  basic: "R$ 27,90",
  complete: "R$ 54,90"
};
const planFeatures: Record<(typeof plans)[number]["key"], string[]> = {
  basic: [
    "Geração de até 25 atividades",
    "PDF descritivo da atividade",
    "Até 5 coleções",
    "Planejamento de atividades"
  ],
  complete: [
    "Geração de até 100 atividades",
    "PDF descritivo da atividade",
    "PDF de material imprimível da atividade",
    "Até 15 coleções",
    "Planejamento de atividades",
    "Skins de planejamento"
  ]
};

export default function PlansPage() {
  const { supabase } = useAuth();
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<PaidPlanKey | null>(null);

  useEffect(() => {
    apiFetch<{ usage: BillingUsage }>(supabase, "/api/billing/usage")
      .then((data) => setUsage(data.usage))
      .catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível carregar planos."));
  }, [supabase]);

  async function startCheckout(planKey: PaidPlanKey) {
    setBusyPlan(planKey);
    setMessage(null);
    try {
      const data = await apiFetch<{ redirect_url: string }>(supabase, "/api/billing/checkout", {
        method: "POST",
        body: {
          plan_key: planKey,
          mode: usage?.plan_key === "basic" && planKey === "complete" ? "upgrade" : "new"
        }
      });
      window.location.href = data.redirect_url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível iniciar o pagamento.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <ProtectedPage title="Planos" subtitle="Escolha o volume de atividades geradas por IA para o seu ciclo de uso.">
      {message ? <p className="mb-4 rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/70">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = usage?.plan_key === plan.key && usage.status === "active";
          const isUpgrade = usage?.plan_key === "basic" && plan.key === "complete";
          return (
            <section key={plan.key} className={`panel flex flex-col p-5 ${isCurrent ? "border-leaf ring-2 ring-leaf/15" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="label mb-2">Plano</p>
                  <h2 className="text-2xl font-bold text-ink">{plan.name}</h2>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-leaf">
                  <Crown size={22} />
                </span>
              </div>

              <p className="mt-5 text-4xl font-bold text-ink">{planPrices[plan.key]}</p>
              <p className="mt-1 text-sm font-semibold text-ink/60">por ciclo de {plan.periodDays} dias</p>

              <div className="mt-5 space-y-2 text-sm text-ink/70">
                {planFeatures[plan.key].map((feature) => (
                  <PlanFeature key={feature} text={feature} />
                ))}
              </div>

              <button
                type="button"
                disabled={busyPlan === plan.key || isCurrent}
                onClick={() => startCheckout(plan.key)}
                className={`mt-6 w-full ${isCurrent ? "btn-secondary" : "btn-primary"}`}
              >
                {isCurrent ? "Plano atual" : isUpgrade ? "Fazer upgrade" : `Assinar ${plan.name}`}
              </button>
            </section>
          );
        })}
      </div>
    </ProtectedPage>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
    <p className="flex gap-2">
      <Check size={17} className="mt-0.5 shrink-0 text-leaf" />
      <span>{text}</span>
    </p>
  );
}
