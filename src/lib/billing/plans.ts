export const PLAN_DEFINITIONS = {
  free: {
    key: "free",
    name: "Gratuito",
    activityLimit: 5,
    periodDays: 7
  },
  basic: {
    key: "basic",
    name: "Básico",
    activityLimit: 25,
    periodDays: 30
  },
  complete: {
    key: "complete",
    name: "Completo",
    activityLimit: 100,
    periodDays: 30
  },
  pro: {
    key: "pro",
    name: "Pro",
    activityLimit: 1000,
    periodDays: 30
  }
} as const;

export type PaidPlanKey = keyof typeof PLAN_DEFINITIONS;
export type SubscriptionStatus = "active" | "past_due" | "suspended" | "canceled";

export type BillingUsage = {
  plan_key: PaidPlanKey | null;
  plan_name: string;
  status: SubscriptionStatus | "inactive";
  generated_count: number;
  activity_limit: number;
  remaining: number;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_ends_at: string | null;
  inactive_delete_after: string | null;
  can_generate: boolean;
  can_upgrade: boolean;
  message: string | null;
};

export function isPlanKey(planKey?: string | null): planKey is PaidPlanKey {
  return Boolean(planKey && planKey in PLAN_DEFINITIONS);
}

export function planName(planKey?: string | null) {
  return isPlanKey(planKey) ? PLAN_DEFINITIONS[planKey].name : "Sem plano";
}

export function planLimit(planKey?: string | null) {
  return isPlanKey(planKey) ? PLAN_DEFINITIONS[planKey].activityLimit : 0;
}

export function planPeriodDays(planKey?: string | null) {
  return isPlanKey(planKey) ? PLAN_DEFINITIONS[planKey].periodDays : 30;
}

export function collectionLimit(planKey?: string | null) {
  if (planKey === "free") return 1;
  if (planKey === "basic") return 5;
  if (planKey === "complete") return 15;
  if (planKey === "pro") return null;
  return 0;
}

export function canUsePrintableMaterial(planKey?: string | null) {
  return planKey === "complete" || planKey === "pro";
}

export function canUsePlanningSkins(planKey?: string | null) {
  return planKey === "complete" || planKey === "pro";
}

export function emptyBillingUsage(message = "Nenhum plano ativo."): BillingUsage {
  return {
    plan_key: null,
    plan_name: "Sem plano",
    status: "inactive",
    generated_count: 0,
    activity_limit: 0,
    remaining: 0,
    current_period_start: null,
    current_period_end: null,
    grace_ends_at: null,
    inactive_delete_after: null,
    can_generate: false,
    can_upgrade: false,
    message
  };
}
