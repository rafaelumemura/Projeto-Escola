import { z } from "zod";
import { fail, ok, readJson } from "@/lib/api/http";
import type { Json } from "@/lib/database.types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const lessonRecordSchema = z.object({
  class_id: z.string().uuid(),
  activity_id: z.string().uuid(),
  lesson_date: z.string().date(),
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
    const { data, error } = await supabase.rpc("save_class_lesson_record", {
      p_class_id: payload.class_id,
      p_activity_id: payload.activity_id,
      p_lesson_date: payload.lesson_date,
      p_students: payload.students as Json
    });

    if (error) throw error;
    return ok({ lesson_record_id: data });
  } catch (error) {
    return fail(error);
  }
}
