import { created, fail, ok, readJson } from "@/lib/api/http";
import { activityFilterSchema, activitySaveSchema } from "@/lib/activities/types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const filters = activityFilterSchema.parse(Object.fromEntries(searchParams.entries()));

    let activityIds: string[] | null = null;

    if (filters.collection_id) {
      const { data: links, error: linksError } = await supabase
        .from("collection_activities")
        .select("activity_id")
        .eq("collection_id", filters.collection_id);

      if (linksError) throw linksError;

      activityIds = links.map((link) => link.activity_id);

      if (activityIds.length === 0) {
        return ok({ activities: [] });
      }
    }

    let query = supabase.from("activities").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

    if (activityIds) query = query.in("id", activityIds);
    if (filters.age_range) query = query.ilike("age_range", `%${filters.age_range}%`);
    if (filters.development_area) query = query.ilike("development_area", `%${filters.development_area}%`);
    if (filters.methodology) query = query.eq("methodology", filters.methodology);
    if (filters.activity_type) query = query.eq("activity_type", filters.activity_type);
    if (filters.created_from) query = query.gte("created_at", filters.created_from);
    if (filters.created_to) query = query.lte("created_at", filters.created_to);

    const { data, error } = await query;

    if (error) throw error;

    return ok({ activities: data });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const body = await readJson<unknown>(request);
    const payload = activitySaveSchema.parse(body);
    const { data, error } = await supabase
      .from("activities")
      .insert({
        ...payload,
        user_id: user.id,
        raw_ai_response: payload.raw_ai_response ?? payload
      })
      .select("*")
      .single();

    if (error) throw error;

    return created({ activity: data });
  } catch (error) {
    return fail(error);
  }
}
