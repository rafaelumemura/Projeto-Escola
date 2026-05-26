import { fail, ok } from "@/lib/api/http";
import { requireServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const expectedSecret = requireServerEnv("BILLING_MAINTENANCE_SECRET");
    const receivedSecret = request.headers.get("x-maintenance-secret");

    if (!receivedSecret || receivedSecret !== expectedSecret) {
      throw Object.assign(new Error("Acesso negado."), { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("billing_maintenance");

    if (error) throw error;

    return ok({ result: data });
  } catch (error) {
    return fail(error);
  }
}
