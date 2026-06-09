import { collectionUpdateSchema } from "@/lib/api/schemas";
import { fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type CollectionRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: CollectionRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data: collection, error } = await supabase
      .from("collections")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    const { data: links, error: linksError } = await supabase
      .from("collection_activities")
      .select("activity_id, activities(*)")
      .eq("collection_id", id);

    if (linksError) throw linksError;

    return ok({
      collection,
      activities: (links || []).map((link) => link.activities).filter(Boolean)
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: CollectionRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = collectionUpdateSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase
      .from("collections")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return ok({ collection: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: CollectionRouteContext) {
  try {
    const { id } = await params;
    const { user, supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase.from("collections").delete().eq("id", id).eq("user_id", user.id);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
