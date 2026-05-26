import { weeklyPlanItemCreateSchema } from "@/lib/api/schemas";
import { created, fail, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const payload = weeklyPlanItemCreateSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("weekly_plan_items")
      .insert({
        ...payload,
        weekly_plan_id: params.id
      })
      .select("*")
      .single();

    if (error) throw error;

    return created({ item: data });
  } catch (error) {
    return fail(error);
  }
}
