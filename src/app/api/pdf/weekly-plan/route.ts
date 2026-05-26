import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { buildWeeklyPlanPdf } from "@/lib/pdf/builders";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  weekly_plan_id: z.string().uuid().optional(),
  weekly_plan: z.record(z.unknown()).optional(),
  items: z.array(z.record(z.unknown())).optional()
});

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = payloadSchema.parse(await readJson<unknown>(request));
    let weeklyPlan = payload.weekly_plan;
    let items = payload.items || [];

    if (payload.weekly_plan_id) {
      const { data: plan, error } = await supabase
        .from("weekly_plans")
        .select("*")
        .eq("id", payload.weekly_plan_id)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      const { data: planItems, error: itemsError } = await supabase
        .from("weekly_plan_items")
        .select("*, activities(*)")
        .eq("weekly_plan_id", payload.weekly_plan_id)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });

      if (itemsError) throw itemsError;

      weeklyPlan = plan;
      items = planItems || [];
    }

    if (!weeklyPlan) {
      throw Object.assign(new Error("Informe weekly_plan_id ou weekly_plan."), { status: 400 });
    }

    const bytes = await buildWeeklyPlanPdf(
      weeklyPlan as Parameters<typeof buildWeeklyPlanPdf>[0],
      items as Parameters<typeof buildWeeklyPlanPdf>[1]
    );

    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=planejamento-semanal.pdf"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
