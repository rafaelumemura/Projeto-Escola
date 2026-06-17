import { readFile } from "fs/promises";
import { join } from "path";
import type { PrintableVisualBriefing } from "@/lib/printable-ai/activity-to-visual-briefing";
import { PRINTABLE_AI_PROMPT_VERSION } from "@/lib/printable-ai/activity-to-visual-briefing";

export async function buildPrintableImagePrompt(briefing: PrintableVisualBriefing) {
  const systemPrompt = await readSystemPrompt();

  return `${systemPrompt}

BRIEFING DINAMICO:
${JSON.stringify(briefing, null, 2)}

Gere uma unica imagem PNG A4 vertical pronta para virar PDF.

Reforce:
- idade: ${briefing.idade} anos, isto deve dominar a direcao de arte;
- tema: ${briefing.tema};
- titulo: ${briefing.titulo};
- instrucao curta: ${briefing.instrucao};
- incluir no topo os campos Nome e Turma de forma natural no design;
- manter textos grandes, legiveis e em portugues brasileiro;
- nao inserir texto pequeno demais;
- nao inserir explicacoes para professor;
- nao inserir marcas d'agua;
- a atividade deve ocupar bem a pagina.
`;
}

export function printableImagePromptVersion() {
  return PRINTABLE_AI_PROMPT_VERSION;
}

async function readSystemPrompt() {
  try {
    return await readFile(join(process.cwd(), "prompts/printable-system-prompt-v1.md"), "utf8");
  } catch {
    return "Crie uma pagina A4 vertical premium de material pedagogico infantil, com hierarquia Nome, Turma, titulo, instrucao curta, atividade e decoracao.";
  }
}
