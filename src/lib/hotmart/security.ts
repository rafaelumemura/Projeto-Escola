import { timingSafeEqual } from "node:crypto";

export function validateHotmartWebhookSecret(request: Request) {
  const expectedSecret = process.env.HOTMART_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    throw Object.assign(new Error("HOTMART_WEBHOOK_SECRET não está configurado no servidor."), { status: 503 });
  }

  const receivedSecret = request.headers.get("x-hotmart-hottok")?.trim();
  if (!receivedSecret || !safeEqual(receivedSecret, expectedSecret)) {
    throw Object.assign(new Error("Webhook Hotmart não autorizado."), { status: 401 });
  }
}

function safeEqual(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
