import { readFile } from "fs/promises";
import { join } from "path";
import { PDFDocument, PDFFont, PDFPage, RGB, StandardFonts, rgb } from "pdf-lib";
import type {
  PrintableMaterialItem,
  PrintableMaterialPage,
  PrintableMaterialPlan
} from "@/lib/activities/printable-material";
import { normalizePlanningPdfSkill, type PlanningPdfSkillKey } from "@/lib/planning/pdf-skills";

type PdfActivity = {
  title?: string | null;
  age_range?: string | null;
  estimated_time?: string | null;
  development_area?: string | null;
  methodology?: string | null;
  activity_type?: string | null;
  environment?: string | null;
  materials?: string | null;
  objective?: string | null;
  bncc_code?: string | null;
  description?: string | null;
  steps?: unknown;
  teacher_tips?: unknown;
  variations?: unknown;
  safety_notes?: string | null;
  evaluation?: string | null;
};

type PdfWeeklyPlan = {
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type PdfWeeklyPlanItem = {
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
  activities?: PdfActivity | null;
  activity?: PdfActivity | null;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 48;

function asLines(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function clean(text: unknown) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
}

function wrapText(text: string, maxChars: number) {
  const words = clean(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;

    if (next.length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);

  return lines.length ? lines : [""];
}

async function createWriter(title: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function ensureSpace(height: number) {
    if (y - height > margin) return;
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function drawTitle(text: string) {
    ensureSpace(60);
    page.drawText(clean(text), {
      x: margin,
      y,
      size: 21,
      font: bold,
      color: rgb(0.12, 0.18, 0.15)
    });
    y -= 32;
  }

  function drawSection(label: string, text?: unknown) {
    const value = clean(text);
    if (!value) return;
    ensureSpace(44);
    page.drawText(clean(label), {
      x: margin,
      y,
      size: 11,
      font: bold,
      color: rgb(0.18, 0.49, 0.35)
    });
    y -= 16;

    for (const line of wrapText(value, 88)) {
      ensureSpace(16);
      page.drawText(line, {
        x: margin,
        y,
        size: 10.5,
        font: regular,
        color: rgb(0.12, 0.14, 0.13)
      });
      y -= 14;
    }
    y -= 8;
  }

  function drawList(label: string, values?: unknown) {
    const lines = asLines(values);
    if (!lines.length) return;
    ensureSpace(44);
    page.drawText(clean(label), {
      x: margin,
      y,
      size: 11,
      font: bold,
      color: rgb(0.18, 0.49, 0.35)
    });
    y -= 16;

    lines.forEach((item, index) => {
      for (const line of wrapText(`${index + 1}. ${item}`, 84)) {
        ensureSpace(16);
        page.drawText(line, {
          x: margin + 10,
          y,
          size: 10.5,
          font: regular,
          color: rgb(0.12, 0.14, 0.13)
        });
        y -= 14;
      }
    });
    y -= 8;
  }

  function drawMeta(label: string, value?: unknown) {
    const text = clean(value);
    if (!text) return;
    ensureSpace(18);
    page.drawText(`${clean(label)}: `, {
      x: margin,
      y,
      size: 10,
      font: bold,
      color: rgb(0.12, 0.14, 0.13)
    });
    page.drawText(text, {
      x: margin + 120,
      y,
      size: 10,
      font: regular,
      color: rgb(0.12, 0.14, 0.13)
    });
    y -= 15;
  }

  drawTitle(title);

  return {
    drawTitle,
    drawSection,
    drawList,
    drawMeta,
    save: () => pdf.save()
  };
}

export async function buildActivityPdf(activity: PdfActivity) {
  const writer = await createWriter(activity.title || "Atividade pedagogica");

  writer.drawMeta("Faixa etaria", activity.age_range);
  writer.drawMeta("Tempo estimado", activity.estimated_time);
  writer.drawMeta("Area", activity.development_area);
  writer.drawMeta("Metodologia", activity.methodology);
  writer.drawMeta("Tipo", activity.activity_type);
  writer.drawMeta("Ambiente", activity.environment);
  writer.drawMeta("BNCC", activity.bncc_code);
  writer.drawSection("Materiais necessarios", activity.materials);
  writer.drawSection("Objetivo pedagogico", activity.objective);
  writer.drawSection("Descricao da atividade", activity.description);
  writer.drawList("Passo a passo", activity.steps);
  writer.drawList("Dicas para o professor", activity.teacher_tips);
  writer.drawList("Variacoes da atividade", activity.variations);
  writer.drawSection("Observacoes de seguranca", activity.safety_notes);
  writer.drawSection("Avaliacao/observacao da crianca", activity.evaluation);

  return writer.save();
}

export async function buildActivityMaterialPdf(activity: PdfActivity, materialPlan: PrintableMaterialPlan) {
  if (!materialPlan.has_material || !materialPlan.pages.length) {
    throw Object.assign(new Error(materialPlan.reason || "Esta atividade nao possui material imprimivel necessario."), { status: 422 });
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  materialPlan.pages.forEach((materialPage, pageIndex) => {
    const items = materialPage.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => item)
    );
    const chunks = chunk(items, materialItemsPerPage(materialPage));

    chunks.forEach((itemChunk, chunkIndex) => {
      const page = pdf.addPage([pageWidth, pageHeight]);
      const pageTitle = materialPage.title || materialPlan.title || activity.title || "Material imprimivel";
      const palette = materialPalette(materialPage);
      drawPremiumPageBackground(page, materialPage, palette);
      const contentTop = drawMaterialPageHeader(page, pageTitle, palette, bold);

      drawMaterialItems(page, itemChunk, materialPage, palette, contentTop, regular, bold);
    });
  });

  return pdf.save();
}

type MaterialPalette = {
  background: RGB;
  primary: RGB;
  secondary: RGB;
  softPrimary: RGB;
  softSecondary: RGB;
  titleText: RGB;
};

function materialPalette(materialPage: PrintableMaterialPage): MaterialPalette {
  const themeDefaults: Record<PrintableMaterialPage["theme"], [string, string, string]> = {
    colorful: ["#00b3af", "#ff4f6d", "#fffdf8"],
    nature: ["#36a269", "#ffb648", "#f7fff8"],
    sky: ["#3185fc", "#ffcc4d", "#f7fbff"],
    celebration: ["#ee4266", "#7c4dff", "#fff8fc"],
    discovery: ["#ff8a34", "#00a7c4", "#fffaf4"],
    story: ["#7652b5", "#f05d8b", "#fbf8ff"]
  };
  const [defaultPrimary, defaultSecondary, defaultBackground] = themeDefaults[materialPage.theme];
  const primaryHex =
    materialPage.theme !== "colorful" && materialPage.primary_color.toLowerCase() === "#00b3af"
      ? defaultPrimary
      : materialPage.primary_color;
  const secondaryHex =
    materialPage.theme !== "colorful" && materialPage.secondary_color.toLowerCase() === "#ff4f6d"
      ? defaultSecondary
      : materialPage.secondary_color;
  const backgroundHex =
    materialPage.theme !== "colorful" && materialPage.background_color.toLowerCase() === "#fffdf8"
      ? defaultBackground
      : materialPage.background_color;
  const primary = hexToRgb(primaryHex, hexToRgb(defaultPrimary, rgb(0, 0.7, 0.69)));
  const secondary = hexToRgb(secondaryHex, hexToRgb(defaultSecondary, rgb(1, 0.31, 0.43)));
  const background = hexToRgb(backgroundHex, hexToRgb(defaultBackground, rgb(1, 0.99, 0.97)));

  return {
    background,
    primary,
    secondary,
    softPrimary: lighten(primary, 0.83),
    softSecondary: lighten(secondary, 0.83),
    titleText: rgb(1, 1, 1)
  };
}

function drawPremiumPageBackground(
  page: PDFPage,
  materialPage: PrintableMaterialPage,
  palette: MaterialPalette
) {
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: palette.background });
  drawRoundedRectangle(page, 18, 18, pageWidth - 36, pageHeight - 36, 24, palette.softPrimary);
  drawRoundedRectangle(page, 23, 23, pageWidth - 46, pageHeight - 46, 21, palette.background);

  const decorations = materialPage.decorations.length
    ? materialPage.decorations
    : defaultThemeDecorations(materialPage.theme);
  const positions = [
    { x: 43, y: pageHeight - 43, size: 24, color: palette.secondary },
    { x: pageWidth - 43, y: pageHeight - 43, size: 22, color: palette.primary },
    { x: 42, y: 42, size: 20, color: palette.primary },
    { x: pageWidth - 42, y: 42, size: 24, color: palette.secondary }
  ];

  positions.forEach((position, index) => {
    const illustration = decorations[index % decorations.length];
    drawSimpleIllustration(page, illustration, position.x, position.y, position.size, position.color);
  });

  [
    { x: 76, y: pageHeight - 38, size: 4, color: palette.secondary },
    { x: pageWidth - 79, y: pageHeight - 74, size: 5, color: palette.primary },
    { x: 79, y: 62, size: 5, color: palette.primary },
    { x: pageWidth - 76, y: 68, size: 4, color: palette.secondary }
  ].forEach((dot) => page.drawCircle({ x: dot.x, y: dot.y, size: dot.size, color: dot.color }));
}

function defaultThemeDecorations(theme: PrintableMaterialPage["theme"]): NonNullable<PrintableMaterialItem["illustration"]>[] {
  const decorations: Record<PrintableMaterialPage["theme"], NonNullable<PrintableMaterialItem["illustration"]>[]> = {
    colorful: ["star", "heart", "pencil", "book"],
    nature: ["leaf", "flower", "tree", "sun"],
    sky: ["cloud", "sun", "star", "balloon"],
    celebration: ["balloon", "star", "heart", "flower"],
    discovery: ["pencil", "book", "star", "sun"],
    story: ["book", "star", "cloud", "heart"]
  };
  return decorations[theme];
}

function drawRoundedRectangle(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: RGB
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  page.drawRectangle({ x: x + safeRadius, y, width: width - safeRadius * 2, height, color });
  page.drawRectangle({ x, y: y + safeRadius, width, height: height - safeRadius * 2, color });
  page.drawCircle({ x: x + safeRadius, y: y + safeRadius, size: safeRadius, color });
  page.drawCircle({ x: x + width - safeRadius, y: y + safeRadius, size: safeRadius, color });
  page.drawCircle({ x: x + safeRadius, y: y + height - safeRadius, size: safeRadius, color });
  page.drawCircle({ x: x + width - safeRadius, y: y + height - safeRadius, size: safeRadius, color });
}

function drawMaterialPageHeader(
  page: PDFPage,
  title: string,
  palette: MaterialPalette,
  bold: PDFFont
) {
  const titleBoxX = margin + 26;
  const titleBoxWidth = pageWidth - titleBoxX * 2;
  const titleLines = wrapTextByWidth(title, titleBoxWidth - 52, bold, 21).slice(0, 2);
  const titleBoxHeight = Math.max(76, titleLines.length * 25 + 34);
  const titleBoxY = pageHeight - 54 - titleBoxHeight;

  drawRoundedRectangle(
    page,
    titleBoxX + 4,
    titleBoxY - 5,
    titleBoxWidth,
    titleBoxHeight,
    18,
    lighten(palette.primary, 0.72)
  );
  drawRoundedRectangle(page, titleBoxX, titleBoxY, titleBoxWidth, titleBoxHeight, 18, palette.primary);

  const titleStartY = titleBoxY + titleBoxHeight / 2 + (titleLines.length - 1) * 12 - 7;
  titleLines.forEach((line, index) => {
    const lineWidth = bold.widthOfTextAtSize(line, 21);
    page.drawText(line, {
      x: titleBoxX + Math.max(26, (titleBoxWidth - lineWidth) / 2),
      y: titleStartY - index * 25,
      size: 21,
      font: bold,
      color: palette.titleText
    });
  });

  return titleBoxY - 28;
}

function materialItemsPerPage(materialPage: PrintableMaterialPage) {
  if (materialPage.layout === "tracing" || materialPage.layout === "observation") return 4;
  if (materialPage.layout === "coloring" || materialPage.layout === "poster") return 2;
  if (materialPage.layout === "mini_book") return 4;
  if (materialPage.layout === "bingo") return 9;
  if (materialPage.layout === "sequence" || materialPage.layout === "classification") return 6;
  return Math.min(8, Math.max(4, materialPage.columns * 4));
}

function drawMaterialItems(
  page: PDFPage,
  items: PrintableMaterialItem[],
  materialPage: PrintableMaterialPage,
  palette: MaterialPalette,
  contentTop: number,
  regular: PDFFont,
  bold: PDFFont
) {
  const columns =
    materialPage.layout === "tracing" ||
    materialPage.layout === "observation" ||
    materialPage.layout === "coloring" ||
    materialPage.layout === "poster"
      ? 1
      : materialPage.layout === "bingo"
        ? 3
        : materialPage.layout === "mini_book"
          ? 2
        : Math.min(materialPage.columns, Math.max(items.length, 1));
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const gapX = 14;
  const gapY = 14;
  const contentBottom = 48;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = Math.max(180, contentTop - contentBottom);
  const itemWidth = (availableWidth - gapX * (columns - 1)) / columns;
  const itemHeight = (availableHeight - gapY * (rows - 1)) / rows;

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (itemWidth + gapX);
    const y = contentTop - (row + 1) * itemHeight - row * gapY;
    drawMaterialItem(page, item, materialPage.layout, palette, index, x, y, itemWidth, itemHeight, regular, bold);
  });
}

function drawMaterialItem(
  page: PDFPage,
  item: PrintableMaterialItem,
  layout: PrintableMaterialPage["layout"],
  palette: MaterialPalette,
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  regular: PDFFont,
  bold: PDFFont
) {
  const defaultAccent = index % 2 === 0 ? palette.primary : palette.secondary;
  const accent =
    item.accent_color.toLowerCase() === "#00b3af"
      ? defaultAccent
      : hexToRgb(item.accent_color, defaultAccent);
  const fill =
    item.color.toLowerCase() === "#ffffff"
      ? lighten(accent, 0.94)
      : hexToRgb(item.color, lighten(accent, 0.94));
  const borderColor = rgb(0.12, 0.14, 0.13);
  const textColor = rgb(0.12, 0.14, 0.13);

  if (layout === "tracing") {
    drawTracingItem(page, item, x, y, width, height, regular, bold, accent);
    return;
  }

  if (layout === "observation") {
    drawObservationItem(page, item, x, y, width, height, regular, bold, accent);
    return;
  }

  if (layout === "coloring") {
    drawColoringItem(page, item, x, y, width, height, bold, accent);
    return;
  }

  if (item.shape === "circle") {
    const size = Math.min(width, height) / 2 - 7;
    page.drawCircle({ x: x + width / 2, y: y + height / 2, size, color: fill, borderColor, borderWidth: 1.2 });
  } else if (item.shape === "square") {
    const size = Math.min(width, height) - 12;
    const squareX = x + (width - size) / 2;
    drawRoundedRectangle(page, squareX + 3, y + 3, size, size, 14, lighten(accent, 0.82));
    drawRoundedRectangle(page, squareX, y + 6, size, size, 14, accent);
    drawRoundedRectangle(page, squareX + 2, y + 8, size - 4, size - 4, 12, fill);
  } else if (item.shape === "triangle") {
    const top = { x: x + width / 2, y: y + height - 8 };
    const left = { x: x + 12, y: y + 12 };
    const right = { x: x + width - 12, y: y + 12 };
    page.drawLine({ start: top, end: left, thickness: 1.4, color: borderColor });
    page.drawLine({ start: left, end: right, thickness: 1.4, color: borderColor });
    page.drawLine({ start: right, end: top, thickness: 1.4, color: borderColor });
  } else if (item.shape === "flag") {
    page.drawRectangle({ x, y: y + 20, width, height: height - 20, color: fill, borderColor, borderWidth: 1.2 });
    page.drawLine({ start: { x, y: y + 20 }, end: { x: x + width / 2, y }, thickness: 1.2, color: borderColor });
    page.drawLine({ start: { x: x + width, y: y + 20 }, end: { x: x + width / 2, y }, thickness: 1.2, color: borderColor });
  } else {
    drawRoundedRectangle(page, x + 4, y - 4, width, height, 15, rgb(0.9, 0.91, 0.9));
    drawRoundedRectangle(page, x, y, width, height, 15, accent);
    drawRoundedRectangle(page, x + 2, y + 2, width - 4, height - 4, 13, fill);
    if (layout === "cut_and_paste" || layout === "labels" || layout === "mini_book") {
      page.drawRectangle({
        x: x - 3,
        y: y - 3,
        width: width + 6,
        height: height + 6,
        borderColor: rgb(0.42, 0.45, 0.44),
        borderWidth: 0.8,
        borderDashArray: [4, 4]
      });
    }
    if (layout === "memory" || layout === "game") {
      drawRoundedRectangle(page, x + 12, y + height - 20, width - 24, 8, 4, lighten(accent, 0.22));
    }
    if (layout === "mini_book") {
      page.drawLine({
        start: { x: x + width / 2, y: y + 10 },
        end: { x: x + width / 2, y: y + height - 10 },
        thickness: 0.8,
        color: rgb(0.65, 0.67, 0.66),
        dashArray: [3, 4]
      });
    }
  }

  const tag = layout === "classification" ? item.group : null;
  if (tag) {
    const tagText = clean(tag).slice(0, 22);
    const tagWidth = Math.min(width - 20, regular.widthOfTextAtSize(tagText, 7.5) + 14);
    page.drawRectangle({
      x: x + width - tagWidth - 8,
      y: y + height - 21,
      width: tagWidth,
      height: 14,
      color: lighten(accent, 0.82)
    });
    page.drawText(tagText, {
      x: x + width - tagWidth - 1,
      y: y + height - 17,
      size: 7.5,
      font: regular,
      color: rgb(0.12, 0.2, 0.19)
    });
  }

  if (layout === "matching") {
    const connectorX = index % 2 === 0 ? x + width - 10 : x + 10;
    page.drawCircle({
      x: connectorX,
      y: y + height / 2,
      size: 5,
      color: rgb(1, 1, 1),
      borderColor: accent,
      borderWidth: 1.3
    });
  }

  if (item.illustration) {
    drawSimpleIllustration(
      page,
      item.illustration,
      x + width / 2,
      y + height * 0.68,
      Math.min(width * 0.28, height * 0.3, 42),
      accent
    );
  }

  const maxMainChars = item.shape === "circle" || item.shape === "square" ? 18 : 25;
  const mainLines = wrapText(item.text, maxMainChars).slice(0, 3);
  const longestLine = mainLines.reduce((longest, line) => Math.max(longest, line.length), 0);
  const fontSize = longestLine > 16 ? 12 : longestLine > 9 ? 14 : 17;
  const mainCenterY = item.illustration ? y + height * 0.28 : y + height * 0.5;
  const mainBlockY = mainCenterY + (mainLines.length - 1) * (fontSize / 2);
  mainLines.forEach((line, lineIndex) => {
    const textWidth = bold.widthOfTextAtSize(line, fontSize);
    page.drawText(line, {
      x: x + Math.max(14, (width - textWidth) / 2),
      y: mainBlockY - lineIndex * (fontSize + 3),
      size: fontSize,
      font: bold,
      color: textColor
    });
  });

  if (item.detail) {
    wrapText(item.detail, 34)
      .slice(0, 2)
      .forEach((line, lineIndex) => {
        const textWidth = regular.widthOfTextAtSize(line, 9);
        page.drawText(line, {
          x: x + Math.max(14, (width - textWidth) / 2),
          y: y + 10 + (1 - lineIndex) * 10,
          size: 9,
          font: regular,
          color: rgb(0.28, 0.31, 0.29)
        });
      });
  }
}

function drawColoringItem(
  page: PDFPage,
  item: PrintableMaterialItem,
  x: number,
  y: number,
  width: number,
  height: number,
  bold: PDFFont,
  accent: RGB
) {
  drawRoundedRectangle(page, x + 4, y - 4, width, height, 18, rgb(0.9, 0.91, 0.9));
  drawRoundedRectangle(page, x, y, width, height, 18, accent);
  drawRoundedRectangle(page, x + 2, y + 2, width - 4, height - 4, 16, rgb(1, 1, 1));

  if (item.illustration) {
    drawSimpleIllustration(
      page,
      item.illustration,
      x + width / 2,
      y + height * 0.56,
      Math.min(width * 0.42, height * 0.42, 100),
      rgb(0.12, 0.14, 0.13),
      true
    );
  } else {
    drawStar(page, x + width / 2, y + height * 0.56, Math.min(width, height) * 0.22, rgb(1, 1, 1), rgb(0.12, 0.14, 0.13));
  }

  const lines = wrapTextByWidth(item.text || item.detail || "Pinte e descubra", width - 44, bold, 16).slice(0, 2);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: x + Math.max(22, (width - bold.widthOfTextAtSize(line, 16)) / 2),
      y: y + 24 - index * 18,
      size: 16,
      font: bold,
      color: accent
    });
  });
}

function drawTracingItem(
  page: PDFPage,
  item: PrintableMaterialItem,
  x: number,
  y: number,
  width: number,
  height: number,
  regular: PDFFont,
  bold: PDFFont,
  accent: RGB
) {
  drawRoundedRectangle(page, x + 4, y - 4, width, height, 16, rgb(0.9, 0.91, 0.9));
  drawRoundedRectangle(page, x, y, width, height, 16, accent);
  drawRoundedRectangle(page, x + 2, y + 2, width - 4, height - 4, 14, rgb(1, 1, 1));
  page.drawText(clean(item.text || item.detail || "Trace"), {
    x: x + 14,
    y: y + height - 23,
    size: 10,
    font: bold,
    color: rgb(0.12, 0.2, 0.19)
  });

  const trace = clean(item.trace_text || item.text);
  const traceSize = trace.length > 12 ? 25 : trace.length > 6 ? 32 : 40;
  page.drawText(trace, {
    x: x + Math.max(16, (width - bold.widthOfTextAtSize(trace, traceSize)) / 2),
    y: y + height / 2 - traceSize * 0.2,
    size: traceSize,
    font: bold,
    color: rgb(0.78, 0.8, 0.79),
    opacity: 0.7
  });

  [y + 24, y + height / 2 - 15].forEach((lineY) => {
    page.drawLine({
      start: { x: x + 14, y: lineY },
      end: { x: x + width - 14, y: lineY },
      thickness: 0.8,
      color: rgb(0.72, 0.75, 0.74),
      dashArray: [2, 4]
    });
  });

  if (item.illustration) {
    drawSimpleIllustration(page, item.illustration, x + width - 31, y + height - 30, 18, accent);
  }
  if (item.detail) {
    page.drawText(clean(item.detail).slice(0, 70), {
      x: x + 14,
      y: y + 9,
      size: 7.5,
      font: regular,
      color: rgb(0.38, 0.42, 0.4)
    });
  }
}

function drawObservationItem(
  page: PDFPage,
  item: PrintableMaterialItem,
  x: number,
  y: number,
  width: number,
  height: number,
  regular: PDFFont,
  bold: PDFFont,
  accent: RGB
) {
  drawRoundedRectangle(page, x + 4, y - 4, width, height, 16, rgb(0.9, 0.91, 0.9));
  drawRoundedRectangle(page, x, y, width, height, 16, accent);
  drawRoundedRectangle(page, x + 2, y + 2, width - 4, height - 4, 14, rgb(1, 1, 1));
  drawRoundedRectangle(page, x + 12, y + height - 40, width - 24, 28, 10, lighten(accent, 0.82));
  page.drawRectangle({ x: x + 14, y: y + height - 29, width: 12, height: 12, borderColor: accent, borderWidth: 1.2 });

  wrapTextByWidth(item.text || item.detail || "Registro", width - 52, bold, 10)
    .slice(0, 2)
    .forEach((line, index) => {
      page.drawText(line, {
        x: x + 36,
        y: y + height - 27 - index * 12,
        size: 10,
        font: bold,
        color: rgb(0.12, 0.2, 0.19)
      });
    });

  const lineStart = y + height - 58;
  for (let lineIndex = 0; lineIndex < 3; lineIndex += 1) {
    const lineY = lineStart - lineIndex * 22;
    page.drawLine({
      start: { x: x + 18, y: lineY },
      end: { x: x + width - 18, y: lineY },
      thickness: 0.65,
      color: rgb(0.75, 0.78, 0.77)
    });
  }

  if (item.illustration) {
    drawSimpleIllustration(page, item.illustration, x + width - 50, y + 48, 42, accent);
  }
  if (item.detail) {
    page.drawText(clean(item.detail).slice(0, 70), {
      x: x + 18,
      y: y + 10,
      size: 7.5,
      font: regular,
      color: rgb(0.38, 0.42, 0.4)
    });
  }
}

function drawSimpleIllustration(
  page: PDFPage,
  illustration: NonNullable<PrintableMaterialItem["illustration"]>,
  centerX: number,
  centerY: number,
  size: number,
  accent: RGB,
  outlineOnly = false
) {
  const light = outlineOnly ? rgb(1, 1, 1) : lighten(accent, 0.58);
  const dark = rgb(0.12, 0.2, 0.19);

  if (illustration === "sun") {
    page.drawCircle({ x: centerX, y: centerY, size: size * 0.34, color: light, borderColor: accent, borderWidth: 1 });
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (Math.PI * 2 * ray) / 8;
      page.drawLine({
        start: { x: centerX + Math.cos(angle) * size * 0.48, y: centerY + Math.sin(angle) * size * 0.48 },
        end: { x: centerX + Math.cos(angle) * size * 0.66, y: centerY + Math.sin(angle) * size * 0.66 },
        thickness: 1.2,
        color: accent
      });
    }
    return;
  }

  if (illustration === "flower") {
    for (let petal = 0; petal < 6; petal += 1) {
      const angle = (Math.PI * 2 * petal) / 6;
      page.drawCircle({
        x: centerX + Math.cos(angle) * size * 0.28,
        y: centerY + Math.sin(angle) * size * 0.28,
        size: size * 0.2,
        color: light,
        borderColor: accent,
        borderWidth: 0.8
      });
    }
    page.drawCircle({ x: centerX, y: centerY, size: size * 0.2, color: accent });
    return;
  }

  if (illustration === "cloud") {
    page.drawCircle({ x: centerX - size * 0.22, y: centerY, size: size * 0.27, color: light, borderColor: accent, borderWidth: 0.8 });
    page.drawCircle({ x: centerX, y: centerY + size * 0.12, size: size * 0.34, color: light, borderColor: accent, borderWidth: 0.8 });
    page.drawCircle({ x: centerX + size * 0.25, y: centerY, size: size * 0.25, color: light, borderColor: accent, borderWidth: 0.8 });
    return;
  }

  if (illustration === "book") {
    page.drawRectangle({ x: centerX - size * 0.52, y: centerY - size * 0.34, width: size * 0.48, height: size * 0.68, color: light, borderColor: accent, borderWidth: 1 });
    page.drawRectangle({ x: centerX + size * 0.04, y: centerY - size * 0.34, width: size * 0.48, height: size * 0.68, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX, y: centerY - size * 0.36 }, end: { x: centerX, y: centerY + size * 0.36 }, thickness: 1, color: accent });
    return;
  }

  if (illustration === "house") {
    page.drawRectangle({ x: centerX - size * 0.38, y: centerY - size * 0.4, width: size * 0.76, height: size * 0.58, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX - size * 0.48, y: centerY + size * 0.18 }, end: { x: centerX, y: centerY + size * 0.55 }, thickness: 1.4, color: accent });
    page.drawLine({ start: { x: centerX, y: centerY + size * 0.55 }, end: { x: centerX + size * 0.48, y: centerY + size * 0.18 }, thickness: 1.4, color: accent });
    return;
  }

  if (illustration === "tree") {
    page.drawRectangle({ x: centerX - size * 0.08, y: centerY - size * 0.45, width: size * 0.16, height: size * 0.48, color: dark });
    page.drawCircle({ x: centerX, y: centerY + size * 0.2, size: size * 0.4, color: light, borderColor: accent, borderWidth: 1 });
    return;
  }

  if (illustration === "pencil") {
    page.drawRectangle({ x: centerX - size * 0.48, y: centerY - size * 0.11, width: size * 0.78, height: size * 0.22, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX + size * 0.3, y: centerY - size * 0.11 }, end: { x: centerX + size * 0.5, y: centerY }, thickness: 1, color: dark });
    page.drawLine({ start: { x: centerX + size * 0.3, y: centerY + size * 0.11 }, end: { x: centerX + size * 0.5, y: centerY }, thickness: 1, color: dark });
    return;
  }

  if (illustration === "leaf") {
    page.drawEllipse({ x: centerX, y: centerY, xScale: size * 0.42, yScale: size * 0.24, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX - size * 0.36, y: centerY }, end: { x: centerX + size * 0.36, y: centerY }, thickness: 1, color: accent });
    return;
  }

  if (illustration === "balloon") {
    page.drawEllipse({ x: centerX, y: centerY + size * 0.12, xScale: size * 0.3, yScale: size * 0.4, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX, y: centerY - size * 0.28 }, end: { x: centerX + size * 0.08, y: centerY - size * 0.58 }, thickness: 0.8, color: dark });
    return;
  }

  if (illustration === "apple") {
    page.drawCircle({ x: centerX - size * 0.14, y: centerY, size: size * 0.3, color: light, borderColor: accent, borderWidth: 1 });
    page.drawCircle({ x: centerX + size * 0.14, y: centerY, size: size * 0.3, color: light, borderColor: accent, borderWidth: 1 });
    page.drawLine({ start: { x: centerX, y: centerY + size * 0.26 }, end: { x: centerX + size * 0.04, y: centerY + size * 0.48 }, thickness: 1.2, color: dark });
    return;
  }

  if (illustration === "heart") {
    page.drawCircle({ x: centerX - size * 0.18, y: centerY + size * 0.12, size: size * 0.25, color: light, borderColor: accent, borderWidth: 0.8 });
    page.drawCircle({ x: centerX + size * 0.18, y: centerY + size * 0.12, size: size * 0.25, color: light, borderColor: accent, borderWidth: 0.8 });
    page.drawLine({ start: { x: centerX - size * 0.4, y: centerY + size * 0.06 }, end: { x: centerX, y: centerY - size * 0.45 }, thickness: 1.2, color: accent });
    page.drawLine({ start: { x: centerX + size * 0.4, y: centerY + size * 0.06 }, end: { x: centerX, y: centerY - size * 0.45 }, thickness: 1.2, color: accent });
    return;
  }

  drawStar(page, centerX, centerY, size * 0.5, illustration === "star" ? accent : light, accent);
}

function drawStar(page: PDFPage, centerX: number, centerY: number, radius: number, fill: RGB, border: RGB) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = Math.PI / 2 + (Math.PI * index) / 5;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.44;
    return {
      x: centerX + Math.cos(angle) * pointRadius,
      y: centerY + Math.sin(angle) * pointRadius
    };
  });

  for (let index = 0; index < points.length; index += 1) {
    page.drawLine({
      start: points[index],
      end: points[(index + 1) % points.length],
      thickness: 1.2,
      color: border
    });
  }
  page.drawCircle({ x: centerX, y: centerY, size: radius * 0.18, color: fill });
}

function lighten(color: RGB, amount: number) {
  return rgb(
    color.red + (1 - color.red) * amount,
    color.green + (1 - color.green) * amount,
    color.blue + (1 - color.blue) * amount
  );
}

function hexToRgb(hex: string, fallback: RGB) {
  const match = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return fallback;
  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  return rgb(red, green, blue);
}

export async function buildWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[], skill?: PlanningPdfSkillKey) {
  const selectedSkill = normalizePlanningPdfSkill(skill);

  if (selectedSkill.startsWith("layout_fundo_")) return buildFramedWeeklyPlanPdf(plan, items, selectedSkill);

  return buildGridWeeklyPlanPdf(plan, items);
}

async function buildGridWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = clean(plan.title) || "Planejamento";
  const landscapeWidth = pageHeight;
  const landscapeHeight = pageWidth;
  const tableMargin = 30;
  const top = landscapeHeight - 34;
  const timeColumnWidth = 78;
  const headerHeight = 46;
  const rowHeight = 68;
  const rowsPerPage = 6;
  const dates = dateRange(plan.start_date, plan.end_date, items);
  const times = uniqueTimes(items);
  const dateChunks = chunk(dates, 7);
  const timeChunks = chunk(times, rowsPerPage);

  for (const dateChunk of dateChunks.length ? dateChunks : [[]]) {
    for (const timeChunk of timeChunks.length ? timeChunks : [["--:--"]]) {
      const page = pdf.addPage([landscapeWidth, landscapeHeight]);
      const columnWidth = (landscapeWidth - tableMargin * 2 - timeColumnWidth) / Math.max(dateChunk.length, 1);
      const tableTop = top - 64;

      page.drawText(title, {
        x: tableMargin,
        y: top,
        size: 18,
        font: bold,
        color: rgb(0.12, 0.18, 0.15)
      });
      page.drawText(`Periodo: ${formatDateLabel(plan.start_date)} a ${formatDateLabel(plan.end_date)}`, {
        x: tableMargin,
        y: top - 24,
        size: 10,
        font: regular,
        color: rgb(0.28, 0.31, 0.29)
      });

      drawCell(page, tableMargin, tableTop, timeColumnWidth, headerHeight, rgb(0.9, 0.96, 0.92));
      drawCenteredText(page, "HORÁRIO", tableMargin, tableTop, timeColumnWidth, headerHeight, bold, 10, rgb(0.12, 0.18, 0.15));

      dateChunk.forEach((date, index) => {
        const x = tableMargin + timeColumnWidth + index * columnWidth;
        drawCell(page, x, tableTop, columnWidth, headerHeight, rgb(0.9, 0.96, 0.92));
        const [day, weekday] = dateHeader(date);
        drawCenteredDateHeader(page, day, weekday, x, tableTop, columnWidth, headerHeight, bold, regular);
      });

      timeChunk.forEach((time, rowIndex) => {
        const y = tableTop - headerHeight - rowIndex * rowHeight;
        drawCell(page, tableMargin, y, timeColumnWidth, rowHeight, rgb(1, 1, 1));
        drawCenteredText(page, time, tableMargin, y, timeColumnWidth, rowHeight, bold, 9, rgb(0.18, 0.49, 0.35));

        dateChunk.forEach((date, dateIndex) => {
          const x = tableMargin + timeColumnWidth + dateIndex * columnWidth;
          const dayItems = itemsForCell(items, date, time);
          const text = dayItems
            .map((item) => {
              const activity = item.activities || item.activity;
              return [activity?.title || "Atividade sem titulo", activity?.bncc_code ? `BNCC ${activity.bncc_code}` : ""]
                .filter(Boolean)
                .join(" - ");
            })
            .join("\n");

          drawCell(page, x, y, columnWidth, rowHeight, rgb(1, 1, 1));
          drawWrappedCellText(page, text, x + 7, y + rowHeight - 16, columnWidth - 14, regular);
        });
      });
    }
  }

  return pdf.save();
}

async function buildFramedWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[], skill: PlanningPdfSkillKey) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const background = await embedPlanningSkinImage(pdf, skill);
  const title = clean(plan.title) || "Planejamento";
  const skinWidth = 960;
  const skinHeight = 720;
  const tableX = 108;
  const tableTop = 516;
  const tableWidth = 744;
  const timeColumnWidth = 78;
  const headerHeight = 40;
  const rowHeight = 54;
  const rowsPerPage = 6;
  const dates = dateRange(plan.start_date, plan.end_date, items);
  const times = uniqueTimes(items);
  const dateChunks = chunk(dates, 7);
  const timeChunks = chunk(times, rowsPerPage);

  for (const dateChunk of dateChunks.length ? dateChunks : [[]]) {
    for (const timeChunk of timeChunks.length ? timeChunks : [["--:--"]]) {
      const page = pdf.addPage([skinWidth, skinHeight]);
      if (background) {
        page.drawImage(background, { x: 0, y: 0, width: skinWidth, height: skinHeight });
      }

      page.drawText(title, {
        x: tableX,
        y: 616,
        size: 22,
        font: bold,
        color: rgb(0.12, 0.18, 0.15)
      });
      page.drawText(`Periodo: ${formatDateLabel(plan.start_date)} a ${formatDateLabel(plan.end_date)}`, {
        x: tableX,
        y: 592,
        size: 11,
        font: regular,
        color: rgb(0.28, 0.31, 0.29)
      });

      drawCell(page, tableX, tableTop, timeColumnWidth, headerHeight, rgb(0.9, 0.96, 0.92));
      drawCenteredText(page, "HORÁRIO", tableX, tableTop, timeColumnWidth, headerHeight, bold, 9.5, rgb(0.12, 0.18, 0.15));

      const columnWidth = (tableWidth - timeColumnWidth) / Math.max(dateChunk.length, 1);
      dateChunk.forEach((date, index) => {
        const x = tableX + timeColumnWidth + index * columnWidth;
        drawCell(page, x, tableTop, columnWidth, headerHeight, rgb(0.9, 0.96, 0.92));
        const [day, weekday] = dateHeader(date);
        drawCenteredDateHeader(page, day, weekday, x, tableTop, columnWidth, headerHeight, bold, regular);
      });

      timeChunk.forEach((time, rowIndex) => {
        const y = tableTop - headerHeight - rowIndex * rowHeight;
        drawCell(page, tableX, y, timeColumnWidth, rowHeight, rgb(1, 1, 1));
        drawCenteredText(page, time, tableX, y, timeColumnWidth, rowHeight, bold, 8.5, rgb(0.18, 0.49, 0.35));

        dateChunk.forEach((date, dateIndex) => {
          const x = tableX + timeColumnWidth + dateIndex * columnWidth;
          const dayItems = itemsForCell(items, date, time);
          const text = dayItems
            .map((item) => {
              const activity = item.activities || item.activity;
              return [activity?.title || "Atividade sem titulo", activity?.bncc_code ? `BNCC ${activity.bncc_code}` : ""]
                .filter(Boolean)
                .join(" - ");
            })
            .join("\n");

          drawCell(page, x, y, columnWidth, rowHeight, rgb(1, 1, 1));
          drawWrappedCellText(page, text, x + 5, y + rowHeight - 14, columnWidth - 10, regular, 4);
        });
      });
    }
  }

  return pdf.save();
}

async function buildDailyScriptWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = clean(plan.title) || "Planejamento";
  const dates = dateRange(plan.start_date, plan.end_date, items);
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 54;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 54;
  };

  page.drawText(title, { x: margin, y, size: 20, font: bold, color: rgb(0.12, 0.18, 0.15) });
  y -= 24;
  page.drawText(`Periodo: ${formatDateLabel(plan.start_date)} a ${formatDateLabel(plan.end_date)}`, {
    x: margin,
    y,
    size: 10,
    font: regular,
    color: rgb(0.28, 0.31, 0.29)
  });
  y -= 30;

  for (const date of dates) {
    const dayItems = itemsForDate(items, date);
    if (y < 150) newPage();

    drawScriptDayHeader(page, date, y, bold);
    y -= 28;

    if (!dayItems.length) {
      page.drawText("Sem atividades planejadas.", { x: margin + 12, y, size: 9, font: regular, color: rgb(0.42, 0.45, 0.43) });
      y -= 28;
      continue;
    }

    for (const item of dayItems) {
      if (y < 130) newPage();
      const activity = item.activities || item.activity;
      const lines = [
        `${formatTime(item.start_time)} - ${clean(activity?.title || "Atividade sem titulo")}`,
        activity?.bncc_code ? `BNCC: ${clean(activity.bncc_code)}` : "",
        activity?.objective ? `Objetivo: ${clean(activity.objective)}` : "",
        item.notes ? `Anotacoes: ${clean(item.notes)}` : ""
      ].filter(Boolean);

      page.drawRectangle({
        x: margin,
        y: y - 58,
        width: pageWidth - margin * 2,
        height: 72,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.86, 0.88, 0.86),
        borderWidth: 0.8
      });

      lines.slice(0, 5).forEach((line, lineIndex) => {
        page.drawText(line, {
          x: margin + 12,
          y: y - lineIndex * 12,
          size: lineIndex === 0 ? 10 : 8.5,
          font: lineIndex === 0 ? bold : regular,
          color: lineIndex === 0 ? rgb(0.12, 0.18, 0.15) : rgb(0.28, 0.31, 0.29)
        });
      });
      y -= 88;
    }

    y -= 8;
  }

  return pdf.save();
}

async function buildCompactListWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = clean(plan.title) || "Planejamento";
  const sortedItems = [...items].sort((a, b) => `${a.date || ""}${a.start_time || ""}`.localeCompare(`${b.date || ""}${b.start_time || ""}`));
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 54;

  const drawHeader = () => {
    page.drawText(title, { x: margin, y, size: 20, font: bold, color: rgb(0.12, 0.18, 0.15) });
    y -= 24;
    page.drawText(`Periodo: ${formatDateLabel(plan.start_date)} a ${formatDateLabel(plan.end_date)}`, {
      x: margin,
      y,
      size: 10,
      font: regular,
      color: rgb(0.28, 0.31, 0.29)
    });
    y -= 34;
    drawCompactListHeader(page, y, bold);
    y -= 24;
  };

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 54;
    drawHeader();
  };

  drawHeader();

  for (const item of sortedItems) {
    if (y < 82) newPage();
    const activity = item.activities || item.activity;
    const rowText = [
      formatDateLabel(item.date),
      formatTime(item.start_time),
      clean(activity?.title || "Atividade sem titulo"),
      activity?.bncc_code ? clean(activity.bncc_code) : "-"
    ];
    const widths = [84, 58, 280, 88];
    let x = margin;

    rowText.forEach((text, index) => {
      drawCell(page, x, y - 24, widths[index], 34, rgb(1, 1, 1));
      drawWrappedCellText(page, text, x + 5, y + 2, widths[index] - 10, regular, 2);
      x += widths[index];
    });
    y -= 34;
  }

  if (!sortedItems.length) {
    page.drawText("Nenhuma atividade planejada no periodo.", { x: margin, y, size: 10, font: regular, color: rgb(0.42, 0.45, 0.43) });
  }

  return pdf.save();
}

function drawScriptDayHeader(page: PDFPage, date: string, y: number, bold: PDFFont) {
  const [day, weekday] = dateHeader(date);
  page.drawRectangle({ x: margin, y: y - 6, width: pageWidth - margin * 2, height: 24, color: rgb(0.9, 0.96, 0.92) });
  page.drawText(`${weekday} - ${day}`, {
    x: margin + 10,
    y,
    size: 11,
    font: bold,
    color: rgb(0.12, 0.18, 0.15)
  });
}

function drawCompactListHeader(page: PDFPage, y: number, bold: PDFFont) {
  const headers = ["Data", "Horário", "Atividade", "BNCC"];
  const widths = [84, 58, 280, 88];
  let x = margin;

  headers.forEach((header, index) => {
    drawCell(page, x, y - 15, widths[index], 24, rgb(0.9, 0.96, 0.92));
    page.drawText(header, { x: x + 5, y: y + 1, size: 8, font: bold, color: rgb(0.12, 0.18, 0.15) });
    x += widths[index];
  });
}

function drawCell(page: PDFPage, x: number, y: number, width: number, height: number, color: RGB) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    borderColor: rgb(0.86, 0.88, 0.86),
    borderWidth: 0.7
  });
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  font: PDFFont,
  size: number,
  color: RGB
) {
  const value = clean(text);
  const textWidth = font.widthOfTextAtSize(value, size);
  page.drawText(value, {
    x: x + Math.max((width - textWidth) / 2, 2),
    y: y + height / 2 - size * 0.32,
    size,
    font,
    color
  });
}

function drawCenteredDateHeader(
  page: PDFPage,
  day: string,
  weekday: string,
  x: number,
  y: number,
  width: number,
  height: number,
  bold: PDFFont,
  regular: PDFFont
) {
  const centerY = y + height / 2;
  const daySize = 8.5;
  const weekdaySize = 7.5;
  const dayWidth = bold.widthOfTextAtSize(day, daySize);
  const weekdayWidth = regular.widthOfTextAtSize(weekday, weekdaySize);

  page.drawText(day, {
    x: x + Math.max((width - dayWidth) / 2, 2),
    y: centerY + 3,
    size: daySize,
    font: bold,
    color: rgb(0.12, 0.18, 0.15)
  });
  page.drawText(weekday, {
    x: x + Math.max((width - weekdayWidth) / 2, 2),
    y: centerY - 9,
    size: weekdaySize,
    font: regular,
    color: rgb(0.28, 0.31, 0.29)
  });
}

function drawWrappedCellText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  maxLines = 5
) {
  if (!clean(text)) return;
  const lines = text
    .split("\n")
    .flatMap((paragraph) => wrapTextByWidth(paragraph, width, font, 7.8))
    .slice(0, maxLines);

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * 10,
      size: 7.8,
      font,
      color: rgb(0.12, 0.14, 0.13)
    });
  });
}

function wrapTextByWidth(text: string, maxWidth: number, font: PDFFont, size: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const parts = splitLongWord(word, maxWidth, font, size);

    for (const part of parts) {
      const next = line ? `${line} ${part}` : part;

      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = part;
      } else {
        line = next;
      }
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function splitLongWord(word: string, maxWidth: number, font: PDFFont, size: number) {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];

  const parts: string[] = [];
  let part = "";

  for (const character of word) {
    const next = `${part}${character}`;

    if (font.widthOfTextAtSize(next, size) > maxWidth && part) {
      parts.push(`${part}-`);
      part = character;
    } else {
      part = next;
    }
  }

  if (part) parts.push(part);
  return parts;
}

function dateRange(startDate?: string | null, endDate?: string | null, items: PdfWeeklyPlanItem[] = []) {
  const itemDates = items.map((item) => item.date).filter((date): date is string => Boolean(date)).sort();
  const start = parseDate(startDate || itemDates[0]);
  const end = parseDate(endDate || itemDates[itemDates.length - 1] || startDate);

  if (!start || !end || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function uniqueTimes(items: PdfWeeklyPlanItem[]) {
  const times = Array.from(new Set(items.map((item) => formatTime(item.start_time)).filter(Boolean))).sort();
  return times.length ? times : ["--:--"];
}

function itemsForCell(items: PdfWeeklyPlanItem[], date: string, time: string) {
  return items.filter((item) => item.date === date && formatTime(item.start_time) === time);
}

function itemsForDate(items: PdfWeeklyPlanItem[], date: string) {
  return items
    .filter((item) => item.date === date)
    .sort((a, b) => formatTime(a.start_time).localeCompare(formatTime(b.start_time)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value?: string | null) {
  const date = parseDate(value);
  if (!date) return "A definir";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function dateHeader(value: string) {
  const date = parseDate(value);
  if (!date) return [value, ""];
  const dateLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  return [dateLabel, weekday];
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

async function embedPlanningSkinImage(pdf: PDFDocument, skill: PlanningPdfSkillKey) {
  try {
    const match = skill.match(/^layout_fundo_(\d)$/);
    const fileName = `planning-skin-layout-fundo-${match?.[1] || "1"}.png`;
    const bytes = await readFile(join(process.cwd(), "public", fileName));
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}
