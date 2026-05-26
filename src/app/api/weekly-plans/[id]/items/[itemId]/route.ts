import { weeklyPlanItemUpdateSchema } from "@/lib/api/schemas";
import { fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function PUT(
  request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const payload = weeklyPlanItemUpdateSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("weekly_plan_items")
      .update(payload)
      .eq("weekly_plan_id", params.id)
      .eq("id", params.itemId)
      .select("*")
      .single();

    if (error) throw error;

    return ok({ item: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase
      .from("weekly_plan_items")
      .delete()
      .eq("weekly_plan_id", params.id)
      .eq("id", params.itemId);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
