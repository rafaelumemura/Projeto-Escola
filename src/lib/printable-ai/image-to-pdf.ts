import { PDFDocument } from "pdf-lib";

const pageWidth = 595.28;
const pageHeight = 841.89;

export async function imageToA4Pdf(imageBytes: Buffer | Uint8Array) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageWidth, pageHeight]);
  const image = await pdf.embedPng(imageBytes).catch(async () => pdf.embedJpg(imageBytes));
  const imageRatio = image.width / image.height;
  const pageRatio = pageWidth / pageHeight;

  let width = pageWidth;
  let height = pageHeight;
  let x = 0;
  let y = 0;

  if (imageRatio > pageRatio) {
    width = pageWidth;
    height = width / imageRatio;
    y = (pageHeight - height) / 2;
  } else {
    height = pageHeight;
    width = height * imageRatio;
    x = (pageWidth - width) / 2;
  }

  page.drawImage(image, { x, y, width, height });
  return pdf.save();
}
