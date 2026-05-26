import { PDFDocument, PDFFont, PDFPage, RGB, StandardFonts, rgb } from "pdf-lib";

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

export async function buildWeeklyPlanPdf(plan: PdfWeeklyPlan, items: PdfWeeklyPlanItem[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const landscapeWidth = pageHeight;
  const landscapeHeight = pageWidth;
  const tableMargin = 30;
  const top = landscapeHeight - 34;
  const timeColumnWidth = 78;
  const headerHeight = 42;
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
      const tableTop = top - 54;

      page.drawText("Planejamento mensal", {
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
      page.drawText("Horario", {
        x: tableMargin + 10,
        y: tableTop + 16,
        size: 10,
        font: bold,
        color: rgb(0.12, 0.18, 0.15)
      });

      dateChunk.forEach((date, index) => {
        const x = tableMargin + timeColumnWidth + index * columnWidth;
        drawCell(page, x, tableTop, columnWidth, headerHeight, rgb(0.9, 0.96, 0.92));
        const [day, weekday] = dateHeader(date);
        page.drawText(day, {
          x: x + 8,
          y: tableTop + 23,
          size: 9,
          font: bold,
          color: rgb(0.12, 0.18, 0.15)
        });
        page.drawText(weekday, {
          x: x + 8,
          y: tableTop + 10,
          size: 8,
          font: regular,
          color: rgb(0.28, 0.31, 0.29)
        });
      });

      timeChunk.forEach((time, rowIndex) => {
        const y = tableTop - headerHeight - rowIndex * rowHeight;
        drawCell(page, tableMargin, y, timeColumnWidth, rowHeight, rgb(1, 1, 1));
        page.drawText(time, {
          x: tableMargin + 10,
          y: y + rowHeight - 22,
          size: 9,
          font: bold,
          color: rgb(0.18, 0.49, 0.35)
        });

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
            .join("; ");

          drawCell(page, x, y, columnWidth, rowHeight, rgb(1, 1, 1));
          drawWrappedCellText(page, text, x + 7, y + rowHeight - 16, columnWidth - 14, regular);
        });
      });
    }
  }

  return pdf.save();
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

function drawWrappedCellText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont
) {
  if (!clean(text)) return;
  const maxChars = Math.max(14, Math.floor(width / 4.8));
  const lines = wrapText(text, maxChars).slice(0, 5);

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
