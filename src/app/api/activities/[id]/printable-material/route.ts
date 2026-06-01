import { fail, ok } from "@/lib/api/http";
import { getSavedPrintableMaterialPlan } from "@/lib/activities/printable-material";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data: activity, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    const material = getSavedPrintableMaterialPlan(activity.raw_ai_response);

    if (!material) {
      throw Object.assign(new Error("Esta atividade ainda não possui análise de material imprimível salva."), { status: 404 });
    }

    return ok({ material });
  } catch (error) {
    return fail(error);
  }
}
