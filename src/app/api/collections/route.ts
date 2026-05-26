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

    return ok({ collections: data });
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
