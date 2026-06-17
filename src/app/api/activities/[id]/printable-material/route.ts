import { fail, ok } from "@/lib/api/http";
import {
  analyzePrintableMaterialWithClaude,
  attachPrintableMaterialPlan,
  getSavedPrintableMaterialPlan
} from "@/lib/activities/printable-material";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import type { Json } from "@/lib/database.types";
import {
  createPrintableAiMaterialMarker,
  isMaterialPrintableV2Enabled
} from "@/lib/printable-ai/activity-to-visual-briefing";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const usage = await getBillingUsage(user.id);

    if (!canUsePrintableMaterial(usage.plan_key)) {
      throw Object.assign(new Error("Material imprimível disponível nos planos Completo e Pro."), { status: 403 });
    }

    const { data: activity, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    const material = getSavedPrintableMaterialPlan(activity.raw_ai_response);

    if (material?.has_material) return ok({ material });

    const regeneratedMaterial = (await isMaterialPrintableV2Enabled(user.id))
      ? createPrintableAiMaterialMarker(activity)
      : await analyzePrintableMaterialWithClaude(activity);
    const rawAiResponse = attachPrintableMaterialPlan(
      activity.raw_ai_response ?? activity,
      regeneratedMaterial
    );
    const { error: updateError } = await supabase
      .from("activities")
      .update({ raw_ai_response: rawAiResponse as Json })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return ok({ material: regeneratedMaterial });
  } catch (error) {
    return fail(error);
  }
}
