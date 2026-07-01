import { fail, ok } from "@/lib/api/http";
import { requireAdmin } from "@/lib/admin/auth";
import { getPlanConfigurations } from "@/lib/billing/plan-config";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";
type Subscription = Database["public"]["Tables"]["billing_subscriptions"]["Row"];

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin(request);
    const [profilesResponse, subscriptionsResponse, printableResponse, collectionsResponse, planConfigurations] = await Promise.all([
      admin.from("profiles").select("id, name, email, plan, is_admin, created_at").order("created_at", { ascending: false }),
      admin.from("billing_subscriptions").select("*").order("created_at", { ascending: false }),
      admin
        .from("printable_ai_generations")
        .select("user_id, generated_at")
        .eq("event_type", "generation")
        .eq("status", "success"),
      admin.from("collections").select("user_id"),
      getPlanConfigurations()
    ]);

    if (profilesResponse.error) throw profilesResponse.error;
    if (subscriptionsResponse.error) throw subscriptionsResponse.error;
    if (printableResponse.error) throw printableResponse.error;
    if (collectionsResponse.error) throw collectionsResponse.error;

    const latestSubscriptions = new Map<string, Subscription>();
    for (const subscription of subscriptionsResponse.data || []) {
      if (!latestSubscriptions.has(subscription.user_id)) latestSubscriptions.set(subscription.user_id, subscription);
    }

    const collectionCounts = new Map<string, number>();
    for (const collection of collectionsResponse.data || []) {
      collectionCounts.set(collection.user_id, (collectionCounts.get(collection.user_id) || 0) + 1);
    }

    const subscribers = (profilesResponse.data || []).map((profile) => {
      const subscription = latestSubscriptions.get(profile.id);
      const planKey = subscription?.plan_key || profile.plan;
      const configuration = planConfigurations.find((item) => item.plan_key === planKey);
      const printableGenerated = (printableResponse.data || []).filter((item) => {
        if (item.user_id !== profile.id) return false;
        if (!subscription?.current_period_start) return true;
        return item.generated_at >= subscription.current_period_start && item.generated_at <= subscription.current_period_end;
      }).length;

      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        is_admin: profile.is_admin,
        registered_at: profile.created_at,
        adhered_at: subscription?.created_at || profile.created_at,
        plan_key: planKey,
        status: subscription?.status || "inactive",
        current_period_start: subscription?.current_period_start || null,
        current_period_end: subscription?.current_period_end || null,
        generated_count: subscription?.generated_count || 0,
        activity_limit: configuration?.activity_limit ?? subscription?.activity_limit ?? 0,
        printable_generated_count: printableGenerated,
        printable_material_limit: configuration?.printable_material_limit || 0,
        collection_count: collectionCounts.get(profile.id) || 0,
        collection_limit: configuration?.collection_limit ?? null
      };
    });

    return ok({ subscribers });
  } catch (error) {
    return fail(error);
  }
}
