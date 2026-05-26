import { fail, ok, readJson } from "@/lib/api/http";
import { generateActivityWithClaude } from "@/lib/activities/claude";
import { activityGenerationInputSchema } from "@/lib/activities/types";
import { assertCanGenerateActivity, incrementActivityGeneration } from "@/lib/billing/usage";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    await assertCanGenerateActivity(user.id);
    const body = await readJson<unknown>(request);
    const input = activityGenerationInputSchema.parse(body);
    const activity = await generateActivityWithClaude(input);
    const usage = await incrementActivityGeneration(user.id);

    return ok({ activity, usage });
  } catch (error) {
    return fail(error);
  }
}
