import { collectionActivitySchema } from "@/lib/api/schemas";
import { created, fail, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const payload = collectionActivitySchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("collection_activities")
      .insert({
        collection_id: params.id,
        activity_id: payload.activity_id
      })
      .select("*")
      .single();

    if (error) throw error;

    return created({ link: data });
  } catch (error) {
    return fail(error);
  }
}
