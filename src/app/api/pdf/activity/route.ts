import { z } from "zod";
import { fail, readJson } from "@/lib/api/http";
import { buildActivityPdf } from "@/lib/pdf/builders";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const payloadSchema = z.object({
  activity_id: z.string().uuid().optional(),
  activity: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);
    const payload = payloadSchema.parse(await readJson<unknown>(request));
    let activity = payload.activity;

    if (payload.activity_id) {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("id", payload.activity_id)
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      activity = data;
    }

    if (!activity) {
      throw Object.assign(new Error("Informe activity_id ou activity."), { status: 400 });
    }

    const bytes = await buildActivityPdf(activity as Parameters<typeof buildActivityPdf>[0]);
    const title = typeof activity.title === "string" && activity.title.trim() ? activity.title.trim() : "atividade";
    const filename = `${title.replace(/[\\/]/g, "-")}.pdf`;
    const fallbackFilename =
      filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/"/g, "")
        .trim() || "atividade.pdf";

    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error) {
    return fail(error);
  }
}
