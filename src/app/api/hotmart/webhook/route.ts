import { createHash } from "node:crypto";
import { fail, ok } from "@/lib/api/http";
import { parseHotmartPayload } from "@/lib/hotmart/payload";
import { processHotmartEvent } from "@/lib/hotmart/processor";
import { validateHotmartWebhookSecret } from "@/lib/hotmart/security";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    ok: true,
    service: "hotmart-webhook",
    configured: {
      secret: Boolean(process.env.HOTMART_WEBHOOK_SECRET),
      custom_temporary_password: Boolean(process.env.HOTMART_TEMP_PASSWORD),
      basic:
        Boolean(process.env.HOTMART_BASIC_OFFER_CODE) ||
        Boolean(process.env.HOTMART_BASIC_PLAN_ID) ||
        Boolean(process.env.HOTMART_BASIC_PRODUCT_ID),
      complete:
        Boolean(process.env.HOTMART_COMPLETE_OFFER_CODE) ||
        Boolean(process.env.HOTMART_COMPLETE_PLAN_ID) ||
        Boolean(process.env.HOTMART_COMPLETE_PRODUCT_ID),
      mapping: {
        basic: {
          offer_code: Boolean(process.env.HOTMART_BASIC_OFFER_CODE),
          plan_id: Boolean(process.env.HOTMART_BASIC_PLAN_ID),
          product_id: Boolean(process.env.HOTMART_BASIC_PRODUCT_ID)
        },
        complete: {
          offer_code: Boolean(process.env.HOTMART_COMPLETE_OFFER_CODE),
          plan_id: Boolean(process.env.HOTMART_COMPLETE_PLAN_ID),
          product_id: Boolean(process.env.HOTMART_COMPLETE_PRODUCT_ID)
        }
      }
    }
  });
}

export async function POST(request: Request) {
  try {
    validateHotmartWebhookSecret(request);

    const rawBody = await request.text();
    const payload = parseJson(rawBody);
    const fallbackEventId = createHash("sha256").update(rawBody).digest("hex");
    const context = parseHotmartPayload(payload, fallbackEventId);
    const result = await processHotmartEvent(createSupabaseAdminClient(), context);

    return ok({
      ok: true,
      ...result
    });
  } catch (error) {
    return fail(error);
  }
}

function parseJson(rawBody: string) {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw Object.assign(new Error("Corpo da requisição precisa ser um JSON válido."), { status: 400 });
  }
}
