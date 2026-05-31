import { fail, ok } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (activityError || !activity) throw Object.assign(activityError || new Error("Atividade nao encontrada."), { status: 404 });

    const planIds = await listUserPlanIds(supabase, user.id);

    if (!planIds.length) {
      return ok({ planned: false, count: 0 });
    }

    const { count, error } = await supabase
      .from("weekly_plan_items")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", params.id)
      .in("weekly_plan_id", planIds)
      .gte("date", todayInSaoPaulo());

    if (error) throw error;

    return ok({ planned: Boolean(count), count: count || 0 });
  } catch (error) {
    return fail(error);
  }
}

async function listUserPlanIds(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"], userId: string) {
  const { data, error } = await supabase.from("weekly_plans").select("id").eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((plan) => plan.id);
}

function todayInSaoPaulo() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
