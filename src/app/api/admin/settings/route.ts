import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import { requireAdmin } from "@/lib/admin/auth";
import {
  API_SECRET_DEFINITIONS,
  getApiSecretStatuses,
  saveApiSecret
} from "@/lib/admin/system-settings";
import {
  clearPlanConfigurationCache,
  getPlanConfigurations
} from "@/lib/billing/plan-config";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

const planConfigurationSchema = z.object({
  plan_key: z.enum(["free", "basic", "complete", "pro"]),
  activity_limit: z.number().int().min(0).max(100000),
  collection_limit: z.number().int().min(0).max(100000).nullable(),
  printable_material_limit: z.number().int().min(0).max(100000),
  period_days: z.number().int().min(1).max(365),
  printable_material_enabled: z.boolean(),
  planning_skins_enabled: z.boolean()
});

const settingsSchema = z.object({
  plans: z.array(planConfigurationSchema).length(4),
  api_keys: z.object({
    anthropic_api_key: z.string().trim().max(500).optional(),
    openai_api_key: z.string().trim().max(500).optional(),
    image_generation_api_key: z.string().trim().max(500).optional()
  }).default({})
});

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [plans, apiKeys] = await Promise.all([
      getPlanConfigurations(),
      getApiSecretStatuses()
    ]);
    return ok({ plans, api_keys: apiKeys });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user, admin } = await requireAdmin(request);
    const payload = settingsSchema.parse(await readJson<unknown>(request));

    for (const plan of payload.plans) {
      const { error } = await admin.from("plan_configurations").upsert({
        ...plan,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      });
      if (error) throw error;

      const { error: subscriptionsError } = await admin
        .from("billing_subscriptions")
        .update({ activity_limit: plan.activity_limit, updated_at: new Date().toISOString() })
        .eq("plan_key", plan.plan_key);
      if (subscriptionsError) throw subscriptionsError;

      await admin.from("admin_setting_audit_logs").insert({
        admin_user_id: user.id,
        action: "plan_limits_updated",
        target_key: plan.plan_key,
        metadata: plan as unknown as Json
      });
    }

    for (const definition of API_SECRET_DEFINITIONS) {
      const nextValue = payload.api_keys[definition.key];
      if (!nextValue) continue;
      await saveApiSecret(definition.key, nextValue, user.id);
      await admin.from("admin_setting_audit_logs").insert({
        admin_user_id: user.id,
        action: "api_secret_rotated",
        target_key: definition.key,
        metadata: { source: "admin_panel" }
      });
    }

    clearPlanConfigurationCache();
    const [plans, apiKeys] = await Promise.all([
      getPlanConfigurations(),
      getApiSecretStatuses()
    ]);
    return ok({ plans, api_keys: apiKeys });
  } catch (error) {
    return fail(error);
  }
}
