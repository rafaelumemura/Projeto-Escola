import { reconcileLatestBillingGeneratedCount } from "@/lib/billing/usage";
import {
  HOTMART_EVENTS,
  isHandledHotmartEvent,
  isSyntheticHotmartTest,
  requireBuyer,
  requirePaidPlan,
  type HotmartEventContext
} from "@/lib/hotmart/payload";
import { ensureHotmartUser, findExistingHotmartUser } from "@/lib/hotmart/users";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type EventLog = {
  id: string;
  status: "processing" | "processed" | "ignored" | "failed";
  updated_at: string;
  result: unknown;
};

type ProcessingResult = {
  action: string;
  user_id?: string;
  plan_key?: string;
  created?: boolean;
  reason?: string;
};

const processingTimeoutMs = 5 * 60 * 1000;

export async function processHotmartEvent(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
) {
  const claim = await claimEvent(supabase, context);
  if (!claim.shouldProcess) {
    return {
      duplicate: true,
      event_id: context.eventId,
      event_type: context.eventType,
      result: claim.event.result
    };
  }

  try {
    const result = await dispatchEvent(supabase, context);
    const eventStatus = result.action === "ignored" ? "ignored" : "processed";

    const { error } = await supabase
      .from("hotmart_events")
      .update({
        status: eventStatus,
        user_id: result.user_id || null,
        result,
        last_error: null,
        processed_at: new Date().toISOString()
      })
      .eq("id", claim.event.id);

    if (error) throw error;

    return {
      duplicate: false,
      event_id: context.eventId,
      event_type: context.eventType,
      result
    };
  } catch (error) {
    await supabase
      .from("hotmart_events")
      .update({
        status: "failed",
        last_error: errorMessage(error),
        processed_at: new Date().toISOString()
      })
      .eq("id", claim.event.id);

    throw error;
  }
}

async function dispatchEvent(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
): Promise<ProcessingResult> {
  if (!isHandledHotmartEvent(context.eventType)) {
    return {
      action: "ignored",
      reason: `Evento ${context.eventType} não altera acesso ou assinatura.`
    };
  }

  if (isSyntheticHotmartTest(context)) {
    return {
      action: "ignored",
      reason:
        "Postback sintético da Hotmart recebido. O teste genérico não possui uma oferta real para identificar o plano."
    };
  }

  if (HOTMART_EVENTS.activate.has(context.eventType)) {
    return activatePurchase(supabase, context);
  }

  if (HOTMART_EVENTS.switchPlan.has(context.eventType)) {
    return switchSubscriptionPlan(supabase, context);
  }

  if (HOTMART_EVENTS.updateChargeDate.has(context.eventType)) {
    return updateSubscriptionChargeDate(supabase, context);
  }

  const userId = await resolveExistingUserId(supabase, context);
  if (!userId) {
    return {
      action: "ignored",
      reason: "Evento recebido para um comprador que ainda não existe no sistema."
    };
  }

  if (HOTMART_EVENTS.cancelAtPeriodEnd.has(context.eventType)) {
    await applySubscriptionStatus(supabase, context, userId, "active", true);
    return {
      action: "cancel_at_period_end",
      user_id: userId
    };
  }

  if (HOTMART_EVENTS.suspend.has(context.eventType)) {
    await applySubscriptionStatus(supabase, context, userId, "suspended", false);
    return {
      action: "suspended",
      user_id: userId,
      reason: context.eventType.toLowerCase()
    };
  }

  await applySubscriptionStatus(supabase, context, userId, "past_due", false);
  return {
    action: "past_due",
    user_id: userId,
    reason: context.eventType.toLowerCase()
  };
}

async function activatePurchase(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
): Promise<ProcessingResult> {
  const buyer = requireBuyer(context);
  const planKey = requirePaidPlan(context);
  const { userId, created } = await ensureHotmartUser(supabase, buyer.email, buyer.name);

  const { error } = await supabase.rpc("apply_hotmart_subscription_activation", {
    p_user_id: userId,
    p_plan_key: planKey,
    p_provider_customer_id: buyer.email,
    p_provider_subscription_id: context.subscriptionId,
    p_product_id: context.productId,
    p_offer_code: context.offerCode,
    p_event_id: context.eventId,
    p_transaction_id: context.transactionId || context.eventId,
    p_started_at: context.occurredAt,
    p_period_end: context.nextChargeAt
  });

  if (error) throw error;
  await reconcileLatestBillingGeneratedCount(userId);

  return {
    action: "activated",
    user_id: userId,
    plan_key: planKey,
    created
  };
}

async function switchSubscriptionPlan(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
): Promise<ProcessingResult> {
  const planKey = requirePaidPlan(context);
  const userId = await resolveExistingUserId(supabase, context);

  if (!userId) {
    return {
      action: "ignored",
      plan_key: planKey,
      reason: "Troca de plano recebida para um usuário que não existe no sistema."
    };
  }

  const { error } = await supabase.rpc("apply_hotmart_subscription_activation", {
    p_user_id: userId,
    p_plan_key: planKey,
    p_provider_customer_id: context.email,
    p_provider_subscription_id: context.subscriptionId,
    p_product_id: context.productId,
    p_offer_code: context.offerCode,
    p_event_id: context.eventId,
    p_transaction_id: null,
    p_started_at: context.occurredAt,
    p_period_end: context.nextChargeAt
  });

  if (error) throw error;
  await reconcileLatestBillingGeneratedCount(userId);

  return {
    action: "plan_switched",
    user_id: userId,
    plan_key: planKey
  };
}

async function updateSubscriptionChargeDate(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
): Promise<ProcessingResult> {
  const userId = await resolveExistingUserId(supabase, context);
  if (!userId || !context.nextChargeAt) {
    return {
      action: "ignored",
      user_id: userId || undefined,
      reason: "Evento sem usuário ou sem próxima data de cobrança."
    };
  }

  let query = supabase
    .from("billing_subscriptions")
    .update({
      current_period_end: context.nextChargeAt,
      next_charge_at: context.nextChargeAt,
      grace_ends_at: addDays(context.nextChargeAt, 1),
      last_provider_event_id: context.eventId,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);

  if (context.subscriptionId) {
    query = query.eq("provider_subscription_id", context.subscriptionId);
  }

  const { error } = await query;
  if (error) throw error;

  return {
    action: "charge_date_updated",
    user_id: userId
  };
}

async function applySubscriptionStatus(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext,
  userId: string,
  status: "active" | "past_due" | "suspended" | "canceled",
  cancelAtPeriodEnd: boolean
) {
  const { error } = await supabase.rpc("apply_hotmart_subscription_status", {
    p_user_id: userId,
    p_provider_subscription_id: context.subscriptionId,
    p_status: status,
    p_reason: context.eventType.toLowerCase(),
    p_event_id: context.eventId,
    p_effective_at: context.occurredAt,
    p_cancel_at_period_end: cancelAtPeriodEnd
  });

  if (error) throw error;
}

async function resolveExistingUserId(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
) {
  if (context.subscriptionId) {
    const { data, error } = await supabase
      .from("billing_subscriptions")
      .select("user_id")
      .eq("provider", "hotmart")
      .eq("provider_subscription_id", context.subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.user_id) return data.user_id;
  }

  return findExistingHotmartUser(supabase, context.email);
}

async function claimEvent(
  supabase: SupabaseAdminClient,
  context: HotmartEventContext
): Promise<{ shouldProcess: boolean; event: EventLog }> {
  const eventPayload = {
    provider_event_id: context.eventId,
    event_type: context.eventType,
    status: "processing",
    transaction_id: context.transactionId,
    subscription_id: context.subscriptionId,
    buyer_email: context.email,
    product_id: context.productId,
    offer_code: context.offerCode,
    payload: context.payload
  };
  const { data, error } = await supabase
    .from("hotmart_events")
    .insert(eventPayload)
    .select("id, status, updated_at, result")
    .single();

  if (!error && data) {
    return {
      shouldProcess: true,
      event: data as EventLog
    };
  }

  if (error?.code !== "23505") {
    if (error?.code === "42P01") {
      throw new Error("A migration de eventos da Hotmart ainda não foi executada no Supabase.");
    }
    throw error;
  }

  const { data: existing, error: existingError } = await supabase
    .from("hotmart_events")
    .select("id, status, updated_at, result")
    .eq("provider_event_id", context.eventId)
    .single();

  if (existingError || !existing) throw existingError || new Error("Evento Hotmart não encontrado após conflito.");

  const event = existing as EventLog;
  if (event.status === "processed" || event.status === "ignored") {
    return { shouldProcess: false, event };
  }

  const isStale =
    event.status === "failed" ||
    Date.now() - new Date(event.updated_at).getTime() >= processingTimeoutMs;

  if (!isStale) return { shouldProcess: false, event };

  const { data: reclaimed, error: reclaimError } = await supabase
    .from("hotmart_events")
    .update({
      status: "processing",
      last_error: null,
      processed_at: null,
      attempt_count: await nextAttemptCount(supabase, event.id)
    })
    .eq("id", event.id)
    .select("id, status, updated_at, result")
    .single();

  if (reclaimError || !reclaimed) throw reclaimError || new Error("Não foi possível reprocessar o evento Hotmart.");
  return {
    shouldProcess: true,
    event: reclaimed as EventLog
  };
}

async function nextAttemptCount(supabase: SupabaseAdminClient, eventId: string) {
  const { data, error } = await supabase
    .from("hotmart_events")
    .select("attempt_count")
    .eq("id", eventId)
    .single();

  if (error) throw error;
  return Math.max(1, Number(data.attempt_count) || 1) + 1;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
