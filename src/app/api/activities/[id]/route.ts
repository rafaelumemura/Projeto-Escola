import { fail, ok, readJson } from "@/lib/api/http";
import { activityUpdateSchema } from "@/lib/activities/types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    return ok({ activity: data });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const body = await readJson<unknown>(request);
    const payload = activityUpdateSchema.parse(body);
    const { data, error } = await supabase
      .from("activities")
      .update(payload)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return ok({ activity: data });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase.from("activities").delete().eq("id", params.id).eq("user_id", user.id);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
