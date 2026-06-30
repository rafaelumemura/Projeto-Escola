import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const lessonRecordSchema = z.object({
  weekly_plan_item_id: z.string().uuid(),
  students: z.array(z.object({
    student_id: z.string().uuid(),
    observation: z.string().max(1000).optional().default(""),
    metrics: z.array(z.object({
      metric_id: z.string().uuid(),
      option_id: z.string().uuid()
    })).default([])
  })).min(1)
});

export async function POST(request: Request) {
  try {
    const { supabase } = await getAuthenticatedUser(request);
    const payload = lessonRecordSchema.parse(await readJson<unknown>(request));
    const { data, error } = await supabase.rpc("save_lesson_record", {
      p_weekly_plan_item_id: payload.weekly_plan_item_id,
      p_students: payload.students as Json
    });

    if (error) throw error;
    return ok({ lesson_record_id: data });
  } catch (error) {
    return fail(error);
  }
}
