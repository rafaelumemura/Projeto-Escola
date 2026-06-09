const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(projectRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function transpileTypeScript(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  });
  module._compile(output.outputText, filename);
};

const {
  isSyntheticHotmartTest,
  parseHotmartPayload
} = require("../src/lib/hotmart/payload.ts");

test("identifica plano básico pelo código da oferta", () => {
  process.env.HOTMART_BASIC_OFFER_CODE = "BASIC-2026";

  const event = parseHotmartPayload(
    {
      id: "event-1",
      event: "PURCHASE_APPROVED",
      data: {
        buyer: { email: "PROFESSORA@EXAMPLE.COM", name: "Professora" },
        product: { id: 123, name: "Projeto Escola" },
        purchase: {
          transaction: "HP123",
          offer: { code: "BASIC-2026" }
        },
        subscription: {
          subscriber: { code: "SUB123" }
        }
      }
    },
    "fallback"
  );

  assert.equal(event.planKey, "basic");
  assert.equal(event.email, "professora@example.com");
  assert.equal(event.subscriptionId, "SUB123");
  assert.equal(event.transactionId, "HP123");
});

test("não interpreta Projeto Escola como plano Pro", () => {
  delete process.env.HOTMART_BASIC_OFFER_CODE;
  delete process.env.HOTMART_PRO_PRODUCT_ID;

  const event = parseHotmartPayload(
    {
      id: "event-2",
      event: "PURCHASE_APPROVED",
      data: {
        buyer: { email: "professora@example.com" },
        product: { id: 123, name: "Projeto Escola" }
      }
    },
    "fallback"
  );

  assert.equal(event.planKey, null);
});

test("usa o nome da oferta quando o nome técnico da assinatura é genérico", () => {
  const event = parseHotmartPayload(
    {
      id: "event-2b",
      event: "PURCHASE_APPROVED",
      data: {
        buyer: { email: "professora@example.com" },
        product: { name: "Projeto Escola" },
        purchase: { offer: { name: "Plano Completo" } },
        subscription: { plan: { name: "Assinatura mensal" } }
      }
    },
    "fallback"
  );

  assert.equal(event.planKey, "complete");
});

test("usa o plano marcado como atual em uma troca de assinatura", () => {
  process.env.HOTMART_COMPLETE_PLAN_ID = "PLAN-COMPLETE";

  const event = parseHotmartPayload(
    {
      id: "event-3",
      event: "SWITCH_PLAN",
      data: {
        subscriber: { email: "professora@example.com" },
        plans: [
          { id: "PLAN-BASIC", name: "Básico", current: false },
          { id: "PLAN-COMPLETE", name: "Completo", current: true }
        ]
      }
    },
    "fallback"
  );

  assert.equal(event.planKey, "complete");
  assert.equal(event.planId, "PLAN-COMPLETE");
});

test("normaliza datas Hotmart em milissegundos", () => {
  process.env.HOTMART_COMPLETE_OFFER_CODE = "COMPLETE-2026";
  const timestamp = Date.UTC(2026, 5, 6, 12, 0, 0);

  const event = parseHotmartPayload(
    {
      id: "event-4",
      event: "PURCHASE_APPROVED",
      data: {
        buyer: { email: "professora@example.com" },
        purchase: {
          approved_date: timestamp,
          offer: { code: "COMPLETE-2026" }
        }
      }
    },
    "fallback"
  );

  assert.equal(event.occurredAt, new Date(timestamp).toISOString());
});

test("reconhece o postback sintético de compra da Hotmart", () => {
  const event = parseHotmartPayload(
    {
      id: "test-event",
      event: "PURCHASE_APPROVED",
      data: {
        buyer: {
          email: "testecomprador@example.com",
          name: "Teste Comprador"
        },
        product: {
          id: 0,
          name: "Produto test postback2"
        },
        purchase: {
          offer: { code: "test" }
        },
        subscription: {
          plan: {
            id: 123,
            name: "plano de teste"
          }
        }
      }
    },
    "fallback"
  );

  assert.equal(isSyntheticHotmartTest(event), true);
  assert.equal(event.productName, "Produto test postback2");
});

test("extrai produto e oferta atual do postback sintético de troca de plano", () => {
  const event = parseHotmartPayload(
    {
      id: "switch-test-event",
      event: "SWITCH_PLAN",
      data: {
        subscriber: { email: "teste@hotmart.com.br" },
        subscription: {
          product: {
            id: 0,
            name: "Produto test postback2"
          }
        },
        plans: [
          {
            id: 654321,
            name: "Novo produto test postback2",
            current: true,
            offer: { key: "n6hup357" }
          }
        ]
      }
    },
    "fallback"
  );

  assert.equal(event.productId, "0");
  assert.equal(event.offerCode, "n6hup357");
  assert.equal(isSyntheticHotmartTest(event), true);
});
