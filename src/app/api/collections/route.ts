import { collectionCreateSchema } from "@/lib/api/schemas";
import { created, fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const collectionIds = (data || []).map((collection) => collection.id);
    const counts = new Map<string, number>();

    if (collectionIds.length) {
      const { data: links, error: linksError } = await supabase
        .from("collection_activities")
        .select("collection_id")
        .in("collection_id", collectionIds);

      if (linksError) throw linksError;

      for (const link of links || []) {
        counts.set(link.collection_id, (counts.get(link.collection_id) || 0) + 1);
      }
    }

    return ok({
      collections: (data || []).map((collection) => ({
        ...collection,
        activity_count: counts.get(collection.id) || 0
      }))
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = collectionCreateSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("collections")
      .insert({ ...payload, user_id: user.id })
      .select("*")
      .single();

    if (error) throw error;

    return created({ collection: data });
  } catch (error) {
    return fail(error);
  }
}
