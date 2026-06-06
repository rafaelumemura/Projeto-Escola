const appUrl = process.env.APP_URL || railwayUrl();
const secret = process.env.BILLING_MAINTENANCE_SECRET;

if (!appUrl || !secret) {
  throw new Error("APP_URL e BILLING_MAINTENANCE_SECRET são obrigatórios.");
}

const response = await fetch(new URL("/api/billing/maintenance", appUrl), {
  method: "POST",
  headers: {
    "x-maintenance-secret": secret
  }
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Manutenção de billing falhou (${response.status}): ${body}`);
}

console.log(body);

function railwayUrl() {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}
