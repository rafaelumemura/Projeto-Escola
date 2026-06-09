import { weeklyPlanItemCreateSchema } from "@/lib/api/schemas";
import { created, fail, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await getAuthenticatedUser(request);
    const payload = weeklyPlanItemCreateSchema.parse(await readJson<unknown>(request));

    if (payload.start_time) {
      const { data: existing, error: existingError } = await supabase
        .from("weekly_plan_items")
        .select("id")
        .eq("weekly_plan_id", id)
        .eq("date", payload.date)
        .eq("start_time", payload.start_time)
        .limit(1);

      if (existingError) throw existingError;

      if (existing?.length) {
        throw Object.assign(new Error("Já existe uma atividade cadastrada nesse horário. Selecione outro horário"), { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from("weekly_plan_items")
      .insert({
        ...payload,
        weekly_plan_id: id
      })
      .select("*")
      .single();

    if (error) throw error;

    return created({ item: data });
  } catch (error) {
    return fail(error);
  }
}
