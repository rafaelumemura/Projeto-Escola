import { fail, ok, readJson } from "@/lib/api/http";
import { activityUpdateSchema } from "@/lib/activities/types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type ActivityRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: ActivityRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    return ok({ activity: data });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: ActivityRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const body = await readJson<unknown>(request);
    const payload = activityUpdateSchema.parse(body);
    const { data, error } = await supabase
      .from("activities")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return ok({ activity: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: ActivityRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const removePlanned = searchParams.get("remove_planned") === "true";
    const { data: activity, error: activityError } = await supabase
      .from("activities")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (activityError || !activity) throw Object.assign(activityError || new Error("Atividade nao encontrada."), { status: 404 });

    const planIds = await listUserPlanIds(supabase, user.id);

    if (planIds.length) {
      const { count, error: countError } = await supabase
        .from("weekly_plan_items")
        .select("id", { count: "exact", head: true })
        .eq("activity_id", id)
        .in("weekly_plan_id", planIds)
        .gte("date", todayInSaoPaulo());

      if (countError) throw countError;

      if (count && !removePlanned) {
        throw Object.assign(
          new Error("Essa atividade está planejada, se você excluir, ela sairá do planejamento, deseja excluir?"),
          { status: 409 }
        );
      }

      if (removePlanned) {
        const { error: planItemsError } = await supabase
          .from("weekly_plan_items")
          .delete()
          .eq("activity_id", id)
          .in("weekly_plan_id", planIds);

        if (planItemsError) throw planItemsError;
      }
    }

    const { error } = await supabase.from("activities").delete().eq("id", id).eq("user_id", user.id);

    if (error) throw error;

    return ok({ success: true });
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
