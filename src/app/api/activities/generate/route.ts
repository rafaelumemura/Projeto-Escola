import { fail, ok, readJson } from "@/lib/api/http";
import { generateActivityWithClaude } from "@/lib/activities/claude";
import { activityGenerationInputSchema } from "@/lib/activities/types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    await getAuthenticatedUser(request);
    const body = await readJson<unknown>(request);
    const input = activityGenerationInputSchema.parse(body);
    const activity = await generateActivityWithClaude(input);

    return ok({ activity });
  } catch (error) {
    return fail(error);
  }
}
