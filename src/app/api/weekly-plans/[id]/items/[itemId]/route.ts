import { weeklyPlanItemUpdateSchema } from "@/lib/api/schemas";
import { fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const { supabase } = await getAuthenticatedUser(request);
    const payload = weeklyPlanItemUpdateSchema.parse(await readJson<unknown>(request));

    if (payload.date && payload.start_time) {
      const { data: existing, error: existingError } = await supabase
        .from("weekly_plan_items")
        .select("id")
        .eq("weekly_plan_id", id)
        .eq("date", payload.date)
        .eq("start_time", payload.start_time)
        .neq("id", itemId)
        .limit(1);

      if (existingError) throw existingError;

      if (existing?.length) {
        throw Object.assign(new Error("Já existe uma atividade cadastrada nesse horário. Selecione outro horário"), { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("weekly_plan_items")
      .update(payload)
      .eq("weekly_plan_id", id)
      .eq("id", itemId)
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
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const { supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase
      .from("weekly_plan_items")
      .delete()
      .eq("weekly_plan_id", id)
      .eq("id", itemId);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
