import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { getSavedPrintableMaterialPlan, printableMaterialPlanSchema } from "@/lib/activities/printable-material";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import { buildActivityMaterialPdf } from "@/lib/pdf/builders";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  activity_id: z.string().uuid(),
  material_plan: printableMaterialPlanSchema.optional()
});

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const usage = await getBillingUsage(user.id);

    if (!canUsePrintableMaterial(usage.plan_key)) {
      throw Object.assign(new Error("Material imprimível disponível apenas no plano Completo."), { status: 403 });
    }

    const payload = payloadSchema.parse(await readJson<unknown>(request));
    const { data: activity, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", payload.activity_id)
      .eq("user_id", user.id)
      .single();

    if (error) throw error;

    const materialPlan = payload.material_plan || getSavedPrintableMaterialPlan(activity.raw_ai_response);

    if (!materialPlan) {
      throw Object.assign(new Error("Esta atividade ainda não possui material imprimível salvo."), { status: 422 });
    }

    if (!materialPlan.has_material) {
      throw Object.assign(new Error(materialPlan.reason || "Esta atividade nao possui material imprimivel necessario."), { status: 422 });
    }

    const bytes = await buildActivityMaterialPdf(activity as Parameters<typeof buildActivityMaterialPdf>[0], materialPlan);
    const title = typeof activity.title === "string" && activity.title.trim() ? activity.title.trim() : "atividade";
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
  } catch (error) {
    return fail(error);
  }
}
