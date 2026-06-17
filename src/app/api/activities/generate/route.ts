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
import {
  createPrintableAiMaterialMarker,
  isMaterialPrintableV2Enabled
} from "@/lib/printable-ai/activity-to-visual-briefing";
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
    const usePrintableV2 = await isMaterialPrintableV2Enabled(user.id);
    const printableMaterial = canUsePrintableMaterial(reservation.usage.plan_key)
      ? usePrintableV2
        ? createPrintableAiMaterialMarker(activity)
        : await analyzePrintableMaterialForSave(activity)
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
    console.error("Failed to prepare printable material", error);
    return {
      mode: "legacy_pages",
      has_material: false,
      reason: "Não foi possível preparar o material imprimível nesta geração. A atividade principal foi salva normalmente.",
      title: null,
      teacher_note: null,
      art_direction: {
        theme_name: null,
        theme_strength: "subtle",
        visual_elements: [],
        avoided_elements: [],
        mechanics_summary: null
      },
      usage_summary: {
        page_count: 0,
        color_mode: "colorido",
        paper_size: "A4",
        techniques: [],
        ideal_for: null,
        suggestion: null
      },
      quality: null,
      editorial: null,
      generated_file: null,
      pages: []
    };
  }
}
