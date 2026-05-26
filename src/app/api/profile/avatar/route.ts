import { fail, ok } from "@/lib/api/http";
import { createSupabaseAdminClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const avatarBucket = "avatars";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxSize = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      throw Object.assign(new Error("Envie uma imagem de perfil."), { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      throw Object.assign(new Error("Formato inválido. Use JPG, PNG, WEBP ou GIF."), { status: 422 });
    }

    if (file.size > maxSize) {
      throw Object.assign(new Error("A foto precisa ter até 5 MB."), { status: 422 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) throw bucketsError;

    if (!buckets?.some((bucket) => bucket.name === avatarBucket)) {
      const { error: createBucketError } = await supabase.storage.createBucket(avatarBucket, {
        public: true,
        fileSizeLimit: maxSize,
        allowedMimeTypes: Array.from(allowedTypes)
      });

      if (createBucketError) throw createBucketError;
    } else {
      const { error: updateBucketError } = await supabase.storage.updateBucket(avatarBucket, {
        public: true,
        fileSizeLimit: maxSize,
        allowedMimeTypes: Array.from(allowedTypes)
      });

      if (updateBucketError) throw updateBucketError;
    }

    const extension = extensionFromType(file.type);
    const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true
    });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(avatarBucket).getPublicUrl(path);
    const avatarUrl = publicUrlData.publicUrl;
    const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);

    if (profileError) throw profileError;

    return ok({ avatar_url: avatarUrl });
  } catch (error) {
    return fail(error);
  }
}

function extensionFromType(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}
