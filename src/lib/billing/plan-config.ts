import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import type { PaidPlanKey } from "@/lib/billing/plans";

export type PlanConfiguration = Database["public"]["Tables"]["plan_configurations"]["Row"];

const fallbackConfigurations: Record<PaidPlanKey, PlanConfiguration> = {
  free: fallback("free", 5, 1, 0, 7, false, false),
  basic: fallback("basic", 25, 5, 0, 30, false, false),
  complete: fallback("complete", 100, 15, 50, 30, true, true),
  pro: fallback("pro", 1000, null, 50, 30, true, true)
};

let cachedConfigurations: { data: PlanConfiguration[]; expiresAt: number } | null = null;

export async function getPlanConfigurations() {
  if (cachedConfigurations && cachedConfigurations.expiresAt > Date.now()) return cachedConfigurations.data;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("plan_configurations").select("*");
    if (error) throw error;
    const resolved = (["free", "basic", "complete", "pro"] as PaidPlanKey[]).map(
      (planKey) => (data || []).find((item) => item.plan_key === planKey) || fallbackConfigurations[planKey]
    );
    cachedConfigurations = { data: resolved, expiresAt: Date.now() + 15_000 };
    return resolved;
  } catch (error) {
    console.error("Failed to load plan configurations; using defaults", error);
    return Object.values(fallbackConfigurations);
  }
}

export async function getPlanConfiguration(planKey?: string | null) {
  const configurations = await getPlanConfigurations();
  return configurations.find((item) => item.plan_key === planKey) || null;
}

export function clearPlanConfigurationCache() {
  cachedConfigurations = null;
}

function fallback(
  planKey: PaidPlanKey,
  activityLimit: number,
  collectionLimit: number | null,
  printableMaterialLimit: number,
  periodDays: number,
  printableMaterialEnabled: boolean,
  planningSkinsEnabled: boolean
): PlanConfiguration {
  return {
    plan_key: planKey,
    activity_limit: activityLimit,
    collection_limit: collectionLimit,
    printable_material_limit: printableMaterialLimit,
    period_days: periodDays,
    printable_material_enabled: printableMaterialEnabled,
    planning_skins_enabled: planningSkinsEnabled,
    updated_by: null,
    created_at: "",
    updated_at: ""
  };
}
