import { fail, ok, readJson } from "@/lib/api/http";
import { generateActivityWithClaude } from "@/lib/activities/claude";
import { attachPrintableMaterialPlan } from "@/lib/activities/printable-material";
import { activityGenerationInputSchema } from "@/lib/activities/types";
import {
  releaseActivityGeneration,
  reserveActivityGeneration,
  type GenerationReservation
} from "@/lib/billing/usage";
import type { Json } from "@/lib/database.types";
import { createPrintableAiMaterialMarker } from "@/lib/printable-ai/activity-to-visual-briefing";
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
    const printableMaterial = reservation.usage.printable_material_enabled
      ? createPrintableAiMaterialMarker(activity)
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
