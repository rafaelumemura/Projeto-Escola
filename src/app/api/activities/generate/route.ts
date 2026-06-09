import { fail, ok, readJson } from "@/lib/api/http";
import { generateActivityWithClaude } from "@/lib/activities/claude";
import {
  analyzePrintableMaterialWithClaude,
  attachPrintableMaterialPlan,
  type PrintableMaterialPlan
} from "@/lib/activities/printable-material";
import { activityGenerationInputSchema } from "@/lib/activities/types";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import {
  releaseActivityGeneration,
  reserveActivityGeneration,
  type GenerationReservation
} from "@/lib/billing/usage";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let reservation: GenerationReservation | null = null;
  let userId: string | null = null;
  let activitySaved = false;

  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    userId = user.id;
    const body = await readJson<unknown>(request);
    const input = activityGenerationInputSchema.parse(body);
    reservation = await reserveActivityGeneration(user.id);
    const activity = await generateActivityWithClaude(input);
    const printableMaterial = canUsePrintableMaterial(reservation.usage.plan_key)
      ? await analyzePrintableMaterialForSave(activity)
      : null;
    const rawAiResponse = printableMaterial
      ? attachPrintableMaterialPlan(activity.raw_ai_response ?? activity, printableMaterial)
      : activity.raw_ai_response ?? activity;
    const { data: savedActivity, error: saveError } = await supabase
      .from("activities")
      .insert({
        ...activity,
        user_id: user.id,
        raw_ai_response: rawAiResponse as Json
      })
      .select("*")
      .single();

    if (saveError) throw saveError;
    activitySaved = true;

    return ok({
      activity: savedActivity,
      usage: reservation.usage
    });
  } catch (error) {
    if (reservation && userId && !activitySaved) {
      try {
        await releaseActivityGeneration(userId, reservation.subscriptionId);
      } catch (releaseError) {
        console.error("Failed to release activity generation reservation", releaseError);
      }
    }

    return fail(error);
  }
}

async function analyzePrintableMaterialForSave(
  activity: Parameters<typeof analyzePrintableMaterialWithClaude>[0]
): Promise<PrintableMaterialPlan> {
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
