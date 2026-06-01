import { created, fail, ok, readJson } from "@/lib/api/http";
import { analyzePrintableMaterialWithClaude, attachPrintableMaterialPlan, type PrintableMaterialPlan } from "@/lib/activities/printable-material";
import { activityFilterSchema, activitySaveSchema } from "@/lib/activities/types";
import { canUsePrintableMaterial, type BillingUsage } from "@/lib/billing/plans";
import { assertCanGenerateActivity, incrementActivityGeneration } from "@/lib/billing/usage";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const filters = activityFilterSchema.parse(Object.fromEntries(searchParams.entries()));

    let activityIds: string[] | null = null;

    if (filters.collection_id) {
      const { data: links, error: linksError } = await supabase
        .from("collection_activities")
        .select("activity_id")
        .eq("collection_id", filters.collection_id);

      if (linksError) throw linksError;

      activityIds = links.map((link) => link.activity_id);

      if (activityIds.length === 0) {
        return ok({ activities: [] });
      }
    }

    let query = supabase.from("activities").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

    if (activityIds) query = query.in("id", activityIds);
    if (filters.age_range) query = query.ilike("age_range", `%${filters.age_range}%`);
    if (filters.development_area) query = query.ilike("development_area", `%${filters.development_area}%`);
    if (filters.methodology) query = query.eq("methodology", filters.methodology);
    if (filters.activity_type) query = query.eq("activity_type", filters.activity_type);
    const { data, error } = await query;

    if (error) throw error;

    const activityIdsForCollections = (data || []).map((activity) => activity.id);
    const collectionMap = new Map<string, string[]>();

    if (activityIdsForCollections.length) {
      const { data: collectionLinks, error: collectionLinksError } = await supabase
        .from("collection_activities")
        .select("activity_id, collection_id")
        .in("activity_id", activityIdsForCollections);

      if (collectionLinksError) throw collectionLinksError;

      for (const link of collectionLinks || []) {
        const current = collectionMap.get(link.activity_id) || [];
        current.push(link.collection_id);
        collectionMap.set(link.activity_id, current);
      }
    }

    return ok({
      activities: (data || []).map((activity) => {
        const collectionIds = collectionMap.get(activity.id) || [];
        return {
          ...activity,
          collection_ids: collectionIds,
          primary_collection_id: collectionIds[0] || null
        };
      })
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const body = await readJson<unknown>(request);
    const payload = activitySaveSchema.parse(body);
    const manualActivity = isManualActivity(payload.raw_ai_response);
    let generationUsage: BillingUsage | null = null;

    if (!manualActivity) {
      generationUsage = await assertCanGenerateActivity(user.id);
    }

    const printableMaterial =
      !manualActivity && canUsePrintableMaterial(generationUsage?.plan_key)
        ? await analyzePrintableMaterialForSave(payload)
        : null;
    const rawAiResponse = printableMaterial
      ? attachPrintableMaterialPlan(payload.raw_ai_response ?? payload, printableMaterial)
      : payload.raw_ai_response ?? payload;

    const { data, error } = await supabase
      .from("activities")
      .insert({
        ...payload,
        user_id: user.id,
        raw_ai_response: rawAiResponse as Json
      })
      .select("*")
      .single();

    if (error) throw error;

    const usage = manualActivity ? null : await incrementActivityGeneration(user.id);

    return created({ activity: data, usage });
  } catch (error) {
    return fail(error);
  }
}

function isManualActivity(rawAiResponse: unknown) {
  return Boolean(
    rawAiResponse &&
      typeof rawAiResponse === "object" &&
      "manual" in rawAiResponse &&
      (rawAiResponse as { manual?: unknown }).manual === true
  );
}

async function analyzePrintableMaterialForSave(activity: Parameters<typeof analyzePrintableMaterialWithClaude>[0]): Promise<PrintableMaterialPlan> {
  try {
    return await analyzePrintableMaterialWithClaude(activity);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Não foi possível analisar o material imprimível.";
    return {
      has_material: false,
      reason,
      title: null,
      teacher_note: null,
      pages: []
    };
  }
}
