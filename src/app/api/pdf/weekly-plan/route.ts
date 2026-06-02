import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { canUsePlanningSkins } from "@/lib/billing/plans";
import { getBillingUsage } from "@/lib/billing/usage";
import { buildWeeklyPlanPdf } from "@/lib/pdf/builders";
import { normalizePlanningPdfSkill } from "@/lib/planning/pdf-skills";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  weekly_plan_id: z.string().uuid().optional(),
  weekly_plan: z.record(z.unknown()).optional(),
  items: z.array(z.record(z.unknown())).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  title: z.string().optional(),
  skill: z.string().optional()
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

      const planItems = await fetchPlanItemsForPdf(supabase, user.id, payload.weekly_plan_id, payload.start_date, payload.end_date);

      weeklyPlan = {
        ...plan,
        title: payload.title || plan.title,
        start_date: payload.start_date || plan.start_date,
        end_date: payload.end_date || plan.end_date
      };
      items = planItems;
    }

    if (!weeklyPlan) {
      throw Object.assign(new Error("Informe weekly_plan_id ou weekly_plan."), { status: 400 });
    }

    const [{ data: profile }, usage] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single(),
      getBillingUsage(user.id)
    ]);
    const skill = canUsePlanningSkins(usage.plan_key)
      ? normalizePlanningPdfSkill(payload.skill || profile?.planning_pdf_skill)
      : "grade";

    const bytes = await buildWeeklyPlanPdf(
      weeklyPlan as Parameters<typeof buildWeeklyPlanPdf>[0],
      items as Parameters<typeof buildWeeklyPlanPdf>[1],
      skill
    );

    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=planejamento.pdf"
      }
    });
  } catch (error) {
    return fail(error);
  }
}

async function fetchPlanItemsForPdf(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  userId: string,
  weeklyPlanId: string,
  startDate?: string,
  endDate?: string
) {
  let planIds = [weeklyPlanId];

  if (startDate || endDate) {
    const { data: plans, error: plansError } = await supabase
      .from("weekly_plans")
      .select("id,start_date,end_date")
      .eq("user_id", userId);

    if (plansError) throw plansError;

    const rangeStart = startDate || "0000-01-01";
    const rangeEnd = endDate || "9999-12-31";
    planIds = (plans || [])
      .filter((plan) => {
        const planStart = plan.start_date || rangeStart;
        const planEnd = plan.end_date || rangeEnd;
        return planStart <= rangeEnd && planEnd >= rangeStart;
      })
      .map((plan) => plan.id);
  }

  if (!planIds.length) return [];

  let itemsQuery = supabase.from("weekly_plan_items").select("*, activities(*)").in("weekly_plan_id", planIds);

  if (startDate) itemsQuery = itemsQuery.gte("date", startDate);
  if (endDate) itemsQuery = itemsQuery.lte("date", endDate);

  const { data: planItems, error: itemsError } = await itemsQuery
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (itemsError) throw itemsError;

  return planItems || [];
}
