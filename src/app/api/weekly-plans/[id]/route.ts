import { weeklyPlanUpdateSchema } from "@/lib/api/schemas";
import { fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data: weeklyPlan, error } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    const { data: items, error: itemsError } = await supabase
      .from("weekly_plan_items")
      .select("*, activities(*)")
      .eq("weekly_plan_id", params.id)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (itemsError) throw itemsError;

    return ok({ weekly_plan: weeklyPlan, items });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = weeklyPlanUpdateSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("weekly_plans")
      .update(payload)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return ok({ weekly_plan: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase.from("weekly_plans").delete().eq("id", params.id).eq("user_id", user.id);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
