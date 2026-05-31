import { fail, ok } from "@/lib/api/http";
import { analyzePrintableMaterialWithClaude } from "@/lib/activities/printable-material";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const { data: activity, error } = await supabase
      .from("activities")
      .select("*")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .single();

    if (error) throw Object.assign(error, { status: 404 });

    const material = await analyzePrintableMaterialWithClaude(activity);

    return ok({ material });
  } catch (error) {
    return fail(error);
  }
}
