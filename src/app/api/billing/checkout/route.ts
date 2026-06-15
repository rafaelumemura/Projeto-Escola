import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const payloadSchema = z.object({
  plan_key: z.enum(["basic", "complete"]),
  mode: z.enum(["new", "upgrade"]).default("new")
});

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request, { allowInactive: true });
    const payload = payloadSchema.parse(await readJson<unknown>(request));
    const redirectUrl = hotmartUrl(payload.plan_key, payload.mode);

    if (!redirectUrl) {
      throw Object.assign(new Error("Configure o link da Hotmart para este plano."), { status: 501 });
    }

    return ok({
      redirect_url: withCheckoutParams(redirectUrl, {
        user_id: user.id,
        email: user.email || "",
        plan: payload.plan_key,
        mode: payload.mode
      })
    });
  } catch (error) {
    return fail(error);
  }
}

function withCheckoutParams(url: string, params: Record<string, string>) {
  try {
    const parsed = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value) parsed.searchParams.set(key, value);
    });
    return parsed.toString();
  } catch {
    return url;
  }
}

function hotmartUrl(planKey: "basic" | "complete", mode: "new" | "upgrade") {
  if (mode === "upgrade") return process.env.HOTMART_UPGRADE_URL || process.env.HOTMART_COMPLETE_URL || "";
  if (planKey === "basic") return process.env.HOTMART_BASIC_URL || "";
  return process.env.HOTMART_COMPLETE_URL || "";
}
