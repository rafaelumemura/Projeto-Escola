import { fail, ok } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; activityId: string } }
) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const { error } = await supabase
      .from("collection_activities")
      .delete()
      .eq("collection_id", params.id)
      .eq("activity_id", params.activityId);

    if (error) throw error;

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
