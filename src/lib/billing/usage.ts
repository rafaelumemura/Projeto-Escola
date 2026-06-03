import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import {
  emptyBillingUsage,
  isPlanKey,
  planLimit,
  planName,
  planPeriodDays,
  type BillingUsage,
  type PaidPlanKey,
  type SubscriptionStatus
} from "@/lib/billing/plans";

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_key: string;
  status: SubscriptionStatus;
  activity_limit: number;
  generated_count: number;
  current_period_start: string;
  current_period_end: string;
  grace_ends_at: string | null;
  inactive_delete_after: string | null;
  suspended_at: string | null;
};

const dayMs = 24 * 60 * 60 * 1000;

export async function getBillingUsage(userId: string): Promise<BillingUsage> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const profileUsage = await createUsageFromProfilePlan(userId);
    if (profileUsage) return profileUsage;
    return emptyBillingUsage("Escolha um plano para gerar atividades com IA.");
  }

  const normalized = await normalizeSubscription(data as SubscriptionRow);
  const reconciled = await reconcileGeneratedCount(normalized);
  return subscriptionToUsage(reconciled);
}

async function createUsageFromProfilePlan(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: profile, error } = await supabase.from("profiles").select("plan, created_at").eq("id", userId).single();

  if (error || !isPlanKey(profile?.plan)) {
    return null;
  }

  const now = profile.plan === "free" && profile.created_at ? new Date(profile.created_at) : new Date();
  const periodDays = planPeriodDays(profile.plan);
  const { data, error: insertError } = await supabase
    .from("billing_subscriptions")
    .insert({
      user_id: userId,
      plan_key: profile.plan,
      status: "active",
      activity_limit: planLimit(profile.plan),
      generated_count: 0,
      current_period_start: now.toISOString(),
      current_period_end: new Date(now.getTime() + periodDays * dayMs).toISOString(),
      grace_ends_at: new Date(now.getTime() + (periodDays + 1) * dayMs).toISOString()
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  const normalized = await normalizeSubscription(data as SubscriptionRow);
  return subscriptionToUsage(normalized);
}

export async function assertCanGenerateActivity(userId: string) {
  const usage = await getBillingUsage(userId);

  if (!usage.can_generate) {
    throw Object.assign(new Error(usage.message || "Limite de geração indisponível para o plano atual."), { status: 402 });
  }

  return usage;
}

export async function incrementActivityGeneration(userId: string) {
  const supabase = createSupabaseAdminClient();
  const usage = await assertCanGenerateActivity(userId);

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .update({
      generated_count: usage.generated_count + 1,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId)
    .eq("status", "active")
    .select("*")
    .single();

  if (error) throw error;
  return subscriptionToUsage(data as SubscriptionRow);
}

export async function reconcileLatestBillingGeneratedCount(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return reconcileGeneratedCount(data as SubscriptionRow);
}

async function reconcileGeneratedCount(subscription: SubscriptionRow) {
  if (!subscription.current_period_start || !subscription.current_period_end) return subscription;

  const actualGeneratedCount = await countGeneratedActivitiesInCycle(
    subscription.user_id,
    subscription.current_period_start,
    subscription.current_period_end
  );
  const cappedGeneratedCount = Math.min(subscription.activity_limit || planLimit(subscription.plan_key), actualGeneratedCount);

  if (cappedGeneratedCount <= subscription.generated_count) {
    return subscription;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .update({
      generated_count: cappedGeneratedCount,
      updated_at: new Date().toISOString()
    })
    .eq("id", subscription.id)
    .select("*")
    .single();

  if (error) throw error;
  return data as SubscriptionRow;
}

async function countGeneratedActivitiesInCycle(userId: string, periodStart: string, periodEnd: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activities")
    .select("raw_ai_response")
    .eq("user_id", userId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd);

  if (error) throw error;

  return (data || []).filter((activity) => !isManualRawAiResponse(activity.raw_ai_response as Json | null)).length;
}

function isManualRawAiResponse(rawAiResponse: Json | null) {
  return Boolean(
    rawAiResponse &&
      typeof rawAiResponse === "object" &&
      !Array.isArray(rawAiResponse) &&
      (rawAiResponse as { manual?: unknown }).manual === true
  );
}

async function normalizeSubscription(subscription: SubscriptionRow) {
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end);
  const graceEndsAt = subscription.grace_ends_at ? new Date(subscription.grace_ends_at) : new Date(periodEnd.getTime() + dayMs);

  if (subscription.status === "active" && now > periodEnd) {
    const nextStatus = now > graceEndsAt ? "suspended" : "past_due";
    return updateSubscriptionStatus(subscription, nextStatus, graceEndsAt);
  }

  if (subscription.status === "past_due" && now > graceEndsAt) {
    return updateSubscriptionStatus(subscription, "suspended", graceEndsAt);
  }

  return subscription;
}

async function updateSubscriptionStatus(subscription: SubscriptionRow, status: "past_due" | "suspended", graceEndsAt: Date) {
  const supabase = createSupabaseAdminClient();
  const suspendedAt = status === "suspended" ? new Date().toISOString() : subscription.suspended_at;
  const inactiveDeleteAfter = status === "suspended" ? new Date(Date.now() + 30 * dayMs).toISOString() : subscription.inactive_delete_after;

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .update({
      status,
      grace_ends_at: graceEndsAt.toISOString(),
      suspended_at: suspendedAt,
      inactive_delete_after: inactiveDeleteAfter,
      updated_at: new Date().toISOString()
    })
    .eq("id", subscription.id)
    .select("*")
    .single();

  if (error) throw error;
  return data as SubscriptionRow;
}

function subscriptionToUsage(subscription: SubscriptionRow): BillingUsage {
  const planKey = isPlanKey(subscription.plan_key) ? subscription.plan_key : null;
  const limit = subscription.activity_limit || planLimit(planKey);
  const generated = Math.max(0, subscription.generated_count || 0);
  const remaining = Math.max(0, limit - generated);
  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end);
  const canGenerate = subscription.status === "active" && remaining > 0 && now <= periodEnd;
  const message = usageMessage(subscription.status, remaining, periodEnd, subscription.inactive_delete_after);

  return {
    plan_key: planKey as PaidPlanKey | null,
    plan_name: planName(planKey),
    status: subscription.status,
    generated_count: generated,
    activity_limit: limit,
    remaining,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    grace_ends_at: subscription.grace_ends_at,
    inactive_delete_after: subscription.inactive_delete_after,
    can_generate: canGenerate,
    can_upgrade: (planKey === "free" || planKey === "basic") && subscription.status === "active",
    message
  };
}

function usageMessage(status: SubscriptionStatus, remaining: number, periodEnd: Date, inactiveDeleteAfter: string | null) {
  if (status === "suspended") {
    return inactiveDeleteAfter
      ? `Plano suspenso. Seus dados ficam disponíveis até ${new Date(inactiveDeleteAfter).toLocaleDateString("pt-BR")}.`
      : "Plano suspenso.";
  }

  if (status === "past_due") return "Pagamento pendente. Renove o plano para voltar a gerar atividades.";
  if (status === "canceled") return "Plano cancelado.";
  if (remaining <= 0) return "Você usou todas as gerações disponíveis neste ciclo.";
  if (new Date() > periodEnd) return "Seu ciclo venceu.";
  return null;
}
