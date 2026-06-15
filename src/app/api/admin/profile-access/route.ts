import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import { planLimit, planPeriodDays } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ownerEmail = "rafaelumemura@gmail.com";
const dayMs = 24 * 60 * 60 * 1000;

const accessSchema = z.object({
  access: z.enum(["admin", "user"]),
  plan_key: z.enum(["free", "basic", "complete", "pro"])
});

export async function PUT(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request, { allowInactive: true });
    const payload = accessSchema.parse(await readJson<unknown>(request));
    const supabase = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    if ((profile?.email || user.email || "").toLowerCase() !== ownerEmail) {
      throw Object.assign(new Error("Ajuste de acesso indisponível para este usuário."), { status: 403 });
    }

    const now = new Date();
    const periodDays = planPeriodDays(payload.plan_key);
    const periodEnd = new Date(now.getTime() + periodDays * dayMs);
    const graceEnd = new Date(now.getTime() + (periodDays + 1) * dayMs);
    const { data: current, error: currentError } = await supabase
      .from("billing_subscriptions")
      .select("id, generated_count, current_period_start, current_period_end, grace_ends_at")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "suspended"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentError) throw currentError;

    const currentCycle = current?.current_period_end && new Date(current.current_period_end) > now ? current : null;
    const activityLimit = planLimit(payload.plan_key);
    const subscriptionPayload = {
      plan_key: payload.plan_key,
      status: "active",
      activity_limit: activityLimit,
      generated_count: currentCycle ? Math.min(currentCycle.generated_count || 0, activityLimit) : 0,
      current_period_start: currentCycle ? currentCycle.current_period_start : now.toISOString(),
      current_period_end: currentCycle ? currentCycle.current_period_end : periodEnd.toISOString(),
      grace_ends_at: currentCycle ? currentCycle.grace_ends_at || graceEnd.toISOString() : graceEnd.toISOString(),
      suspended_at: null,
      inactive_delete_after: null,
      canceled_at: null,
      provider: "admin_override",
      updated_at: now.toISOString()
    };

    const { error: subscriptionError } = current
      ? await supabase.from("billing_subscriptions").update(subscriptionPayload).eq("id", current.id)
      : await supabase.from("billing_subscriptions").insert({
          ...subscriptionPayload,
          user_id: user.id
        });

    if (subscriptionError) throw subscriptionError;

    const { data: updatedProfile, error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        is_admin: payload.access === "admin",
        plan: payload.plan_key
      })
      .eq("id", user.id)
      .select("*")
      .single();

    if (updateProfileError) throw updateProfileError;

    const usage = await getBillingUsage(user.id);
    return ok({ profile: updatedProfile, usage });
  } catch (error) {
    return fail(error);
  }
}
