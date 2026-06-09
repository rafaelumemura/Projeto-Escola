import { collectionActivitySchema } from "@/lib/api/schemas";
import { created, fail, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await getAuthenticatedUser(request);
    const payload = collectionActivitySchema.parse(await readJson<unknown>(request));
    const { data: existing, error: existingError } = await supabase
      .from("collection_activities")
      .select("*")
      .eq("collection_id", id)
      .eq("activity_id", payload.activity_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return created({ link: existing });

    const { data, error } = await supabase
      .from("collection_activities")
      .insert({
        collection_id: id,
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
