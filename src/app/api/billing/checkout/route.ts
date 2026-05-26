import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const payloadSchema = z.object({
  plan_key: z.enum(["basic", "complete"]),
  mode: z.enum(["new", "upgrade"]).default("new")
});

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser(request);
    payloadSchema.parse(await readJson<unknown>(request));

    throw Object.assign(
      new Error("Checkout ainda não configurado. Conecte um provedor de pagamento para ativar compras no app."),
      { status: 501 }
    );
  } catch (error) {
    return fail(error);
  }
}
