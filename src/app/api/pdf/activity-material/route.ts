import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import {
  attachPrintableMaterialPlan,
  getSavedPrintableMaterialPlan,
  type PrintableMaterialPlan
} from "@/lib/activities/printable-material";
import { canUsePrintableMaterial } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import type { Json } from "@/lib/database.types";
import { buildActivityMaterialPdf } from "@/lib/pdf/builders";
import {
  PRINTABLE_AI_MONTHLY_LIMIT,
  activityToVisualBriefing,
  createPrintableAiMaterialMarker,
  getPrintableAiMonthlyUsage,
  logPrintableAiGeneration,
  type PrintableVisualBriefing
} from "@/lib/printable-ai/activity-to-visual-briefing";
import { generatePrintableImage } from "@/lib/printable-ai/image-generator";
import { buildPrintableImagePrompt } from "@/lib/printable-ai/image-prompt-builder";
import { imageToA4Pdf } from "@/lib/printable-ai/image-to-pdf";
import { findSimilarPrintableMaterial } from "@/lib/printable-ai/similar-material-cache";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  activity_id: z.string().uuid()
});

const printableMaterialsBucket = "printable-materials";
type PrintableGeneratedFile = NonNullable<PrintableMaterialPlan["generated_file"]>;
type ActivityForPrintableMarker = Parameters<typeof createPrintableAiMaterialMarker>[0];

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

    const materialPlan = getSavedPrintableMaterialPlan(activity.raw_ai_response);

    if (canUsePrintableMaterial(usage.plan_key)) {
      const existingFile = getGeneratedPrintableFile(materialPlan);

      if (existingFile) {
        const bytes = await downloadStoredPrintablePdf(existingFile.storage_bucket, existingFile.storage_path);
        await logPrintableAiGeneration({
          userId: user.id,
          activityId: activity.id,
          briefing: null,
          generationTime: 0,
          status: "success",
          eventType: "download",
          storageBucket: existingFile.storage_bucket,
          storagePath: existingFile.storage_path
        });

        return pdfResponse(bytes, activity.title);
      }

      const monthlyUsage = await getPrintableAiMonthlyUsage(user.id, usage.current_period_start);
      if (monthlyUsage >= PRINTABLE_AI_MONTHLY_LIMIT) {
        await logPrintableAiGeneration({
          userId: user.id,
          activityId: activity.id,
          briefing: null,
          generationTime: 0,
          status: "failed",
          eventType: "blocked",
          errorMessage: `Limite mensal de ${PRINTABLE_AI_MONTHLY_LIMIT} materiais imprimiveis atingido.`
        });
        throw Object.assign(
          new Error(`Você atingiu o limite mensal de ${PRINTABLE_AI_MONTHLY_LIMIT} materiais imprimíveis. Os materiais já gerados continuam disponíveis para download.`),
          { status: 429 }
        );
      }

      const startedAt = Date.now();
      let briefing: Awaited<ReturnType<typeof activityToVisualBriefing>> | null = null;

      try {
        briefing = await activityToVisualBriefing(activity);
        const cachedMaterial = await findSimilarPrintableMaterial(briefing, activity.id);

        if (cachedMaterial) {
          const generatedFile = {
            storage_bucket: cachedMaterial.storageBucket,
            storage_path: cachedMaterial.storagePath,
            content_type: "application/pdf" as const,
            generated_at: new Date().toISOString(),
            provider: "similar-cache",
            model: cachedMaterial.promptVersion
          };
          const bytes = await downloadStoredPrintablePdf(generatedFile.storage_bucket, generatedFile.storage_path);
          const printableMaterial = createCachedPrintableMaterialPlan(activity, materialPlan, briefing, generatedFile);
          const rawAiResponse = attachPrintableMaterialPlan(activity.raw_ai_response ?? activity, printableMaterial);
          const { error: updateError } = await supabase
            .from("activities")
            .update({ raw_ai_response: rawAiResponse as Json })
            .eq("id", activity.id)
            .eq("user_id", user.id);

          if (updateError) throw updateError;

          await logPrintableAiGeneration({
            userId: user.id,
            activityId: activity.id,
            briefing,
            generationTime: Date.now() - startedAt,
            status: "success",
            eventType: "cache_reuse",
            storageBucket: generatedFile.storage_bucket,
            storagePath: generatedFile.storage_path
          });

          return pdfResponse(bytes, activity.title);
        }

        const prompt = await buildPrintableImagePrompt(briefing);
        const image = await generatePrintableImage(prompt);
        const bytes = await imageToA4Pdf(image.bytes);
        const generatedFile = await uploadGeneratedPrintablePdf({
          userId: user.id,
          activityId: activity.id,
          bytes,
          provider: image.provider,
          model: image.model
        });
        const printableMaterial = {
          ...(materialPlan || createPrintableAiMaterialMarker(activity)),
          title: briefing.titulo,
          has_material: true,
          generated_file: generatedFile
        } satisfies PrintableMaterialPlan;
        const rawAiResponse = attachPrintableMaterialPlan(activity.raw_ai_response ?? activity, printableMaterial);
        const { error: updateError } = await supabase
          .from("activities")
          .update({ raw_ai_response: rawAiResponse as Json })
          .eq("id", activity.id)
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        await logPrintableAiGeneration({
          userId: user.id,
          activityId: activity.id,
          briefing,
          generationTime: Date.now() - startedAt,
          status: "success",
          eventType: "generation",
          storageBucket: generatedFile.storage_bucket,
          storagePath: generatedFile.storage_path
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
          eventType: "generation",
          errorMessage: message.slice(0, 1000)
        });
      }
    }

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

function getGeneratedPrintableFile(materialPlan: PrintableMaterialPlan | null) {
  const file = materialPlan?.generated_file;
  if (!file?.storage_path) return null;

  return {
    storage_bucket: file.storage_bucket || printableMaterialsBucket,
    storage_path: file.storage_path
  };
}

function createCachedPrintableMaterialPlan(
  activity: ActivityForPrintableMarker,
  materialPlan: PrintableMaterialPlan | null,
  briefing: PrintableVisualBriefing,
  generatedFile: PrintableGeneratedFile
): PrintableMaterialPlan {
  const base = materialPlan || createPrintableAiMaterialMarker(activity);

  return {
    ...base,
    title: briefing.titulo,
    has_material: true,
    reason: "Material imprimivel reutilizado por similaridade pedagogica.",
    generated_file: generatedFile,
    editorial: {
      ...base.editorial,
      theme: briefing.tema,
      age: briefing.idade,
      objective: briefing.objetivo_pedagogico,
      area: briefing.area,
      keywords: briefing.conceitos_principais,
      printable_type: "gpt-image-v2-cache",
      required_asset_types: base.editorial.required_asset_types || [],
      assets: base.editorial.assets || [],
      html: base.editorial.html || null,
      composition: base.editorial.composition ?? null
    }
  };
}

async function downloadStoredPrintablePdf(bucket: string, path: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);

  if (error || !data) {
    throw Object.assign(new Error("Não foi possível baixar o material imprimível salvo."), { status: 502 });
  }

  return new Uint8Array(await data.arrayBuffer());
}

async function uploadGeneratedPrintablePdf(input: {
  userId: string;
  activityId: string;
  bytes: Uint8Array;
  provider: string;
  model: string;
}) {
  const admin = createSupabaseAdminClient();
  await ensurePrintableMaterialsBucket(admin);
  const storagePath = `${input.userId}/${input.activityId}/material-${Date.now()}.pdf`;
  const { error } = await admin.storage.from(printableMaterialsBucket).upload(storagePath, Buffer.from(input.bytes), {
    contentType: "application/pdf",
    upsert: false
  });

  if (error) throw error;

  return {
    storage_bucket: printableMaterialsBucket,
    storage_path: storagePath,
    content_type: "application/pdf" as const,
    generated_at: new Date().toISOString(),
    provider: input.provider,
    model: input.model
  };
}

async function ensurePrintableMaterialsBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;

  if (buckets?.some((bucket) => bucket.name === printableMaterialsBucket)) return;

  const { error: createError } = await admin.storage.createBucket(printableMaterialsBucket, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf"]
  });

  if (createError) throw createError;
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
