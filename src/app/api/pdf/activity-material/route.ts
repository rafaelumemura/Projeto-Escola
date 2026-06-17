import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { getSavedPrintableMaterialPlan } from "@/lib/activities/printable-material";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import { buildActivityMaterialPdf } from "@/lib/pdf/builders";
import {
  activityToVisualBriefing,
  isMaterialPrintableV2Enabled,
  logPrintableAiGeneration
} from "@/lib/printable-ai/activity-to-visual-briefing";
import { generatePrintableImage } from "@/lib/printable-ai/image-generator";
import { buildPrintableImagePrompt } from "@/lib/printable-ai/image-prompt-builder";
import { imageToA4Pdf } from "@/lib/printable-ai/image-to-pdf";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  activity_id: z.string().uuid()
});

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const usage = await getBillingUsage(user.id);

    if (!canUsePrintableMaterial(usage.plan_key)) {
      throw Object.assign(new Error("Material imprimível disponível nos planos Completo e Pro."), { status: 403 });
    }

    const payload = payloadSchema.parse(await readJson<unknown>(request));
    const { data: activity, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", payload.activity_id)
      .eq("user_id", user.id)
      .single();

    if (error) throw error;

    if (await isMaterialPrintableV2Enabled(user.id)) {
      const startedAt = Date.now();
      let briefing: Awaited<ReturnType<typeof activityToVisualBriefing>> | null = null;

      try {
        briefing = await activityToVisualBriefing(activity);
        const prompt = await buildPrintableImagePrompt(briefing);
        const image = await generatePrintableImage(prompt);
        const bytes = await imageToA4Pdf(image.bytes);
        await logPrintableAiGeneration({
          userId: user.id,
          activityId: activity.id,
          briefing,
          generationTime: Date.now() - startedAt,
          status: "success"
        });

        return pdfResponse(bytes, activity.title);
      } catch (v2Error) {
        const message = v2Error instanceof Error ? v2Error.message : "Falha desconhecida no Material Imprimivel V2.";
        console.error("Material Imprimivel V2 failed; falling back to legacy material", v2Error);
        await logPrintableAiGeneration({
          userId: user.id,
          activityId: activity.id,
          briefing,
          generationTime: Date.now() - startedAt,
          status: "failed",
          errorMessage: message.slice(0, 1000)
        });
      }
    }

    const materialPlan = getSavedPrintableMaterialPlan(activity.raw_ai_response);

    if (!materialPlan) {
      throw Object.assign(new Error("Esta atividade ainda não possui material imprimível salvo."), { status: 422 });
    }

    if (!materialPlan.has_material) {
      throw Object.assign(new Error(materialPlan.reason || "Esta atividade nao possui material imprimivel necessario."), { status: 422 });
    }

    const bytes = await buildActivityMaterialPdf(activity as Parameters<typeof buildActivityMaterialPdf>[0], materialPlan);
    return pdfResponse(bytes, activity.title);
  } catch (error) {
    return fail(error);
  }
}

function pdfResponse(bytes: Uint8Array, titleValue?: string | null) {
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : "atividade";
  const filename = `${title.replace(/[\\/]/g, "-")}-material.pdf`;
  const fallbackFilename =
    filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/"/g, "")
      .trim() || "atividade-material.pdf";

  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    }
  });
}
