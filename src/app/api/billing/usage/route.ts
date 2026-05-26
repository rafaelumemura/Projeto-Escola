import { fail, ok } from "@/lib/api/http";
import { getBillingUsage } from "@/lib/billing/usage";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const usage = await getBillingUsage(user.id);

    return ok({ usage });
  } catch (error) {
    return fail(error);
  }
}
