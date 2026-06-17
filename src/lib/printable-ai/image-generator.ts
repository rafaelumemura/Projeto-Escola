export type GeneratedPrintableImage = {
  bytes: Buffer;
  model: string;
  provider: string;
};

export async function generatePrintableImage(prompt: string): Promise<GeneratedPrintableImage> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.IMAGE_GENERATION_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("OPENAI_API_KEY ou IMAGE_GENERATION_API_KEY ausente para gerar Material Imprimível V2."), {
      status: 503
    });
  }

  const endpoint = process.env.IMAGE_GENERATION_ENDPOINT || "https://api.openai.com/v1/images/generations";
  const model = process.env.IMAGE_GENERATION_MODEL || "gpt-image-2";
  const payload = {
    model,
    prompt,
    size: "1024x1536",
    quality: process.env.IMAGE_GENERATION_QUALITY || "high",
    output_format: "png"
  };

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok && response.status === 400) {
    const body = await response.text();
    if (!/unknown parameter|unsupported parameter|unrecognized request argument|invalid param/i.test(body)) {
      throw Object.assign(new Error(`Falha na GPT Image: ${body}`), { status: 502 });
    }

    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1536"
      })
    });
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Falha na GPT Image: ${await response.text()}`), { status: 502 });
  }

  const data = await response.json();
  const item = data?.data?.[0];

  if (item?.b64_json) {
    return {
      bytes: Buffer.from(item.b64_json, "base64"),
      model,
      provider: "openai"
    };
  }

  if (item?.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw Object.assign(new Error("Nao foi possivel baixar a imagem gerada pela GPT Image."), { status: 502 });
    }

    return {
      bytes: Buffer.from(await imageResponse.arrayBuffer()),
      model,
      provider: "openai"
    };
  }

  throw Object.assign(new Error("A GPT Image nao retornou PNG."), { status: 502 });
}
