import { jsPDF } from "jspdf";
import { toPng } from 'html-to-image';

export type TeamShareFileResult = {
  ok: boolean;
  mode: "web-share" | "download" | "text";
  message: string;
};

/**
 * Utility to convert an image URL to a Data URL (base64)
 * to avoid CORS issues when capturing canvas/PDF.
 */
export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[imageUrlToDataUrl] Error converting image:", err, url);
    return null;
  }
}

/**
 * Normalizes group names to a friendly format.
 */
export function getFriendlyGroupName(nameOrId?: string): string {
  if (!nameOrId) return "TURMA";
  const normalized = nameOrId.toLowerCase();
  if (normalized.includes("terca") || normalized.includes("terça") || normalized.includes("387c23a9")) return "TERÇA-FEIRA";
  if (normalized.includes("quarta") || normalized.includes("83320c90")) return "QUARTA-FEIRA";
  if (normalized.includes("quinta") || normalized.includes("988b15d2")) return "QUINTA-FEIRA";
  if (normalized.includes("sabado") || normalized.includes("sábado")) return "SÁBADO";
  return nameOrId.toUpperCase();
}

/**
 * Central generation function for teams share artwork.
 * Renders a hidden DOM element to a high-res PNG.
 */
export async function renderTeamsShareCanvas(element: HTMLElement): Promise<string> {
  // Wait for fonts to be ready
  await document.fonts.ready;

  const images = Array.from(element.querySelectorAll("img"));
  await Promise.allSettled(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));
  
  // High quality export options
  const dataUrl = await toPng(element, {
    width: 1080,
    height: 1350,
    pixelRatio: 2, // Fixed pixel ratio for deterministic quality (2160x2700 physical)
    backgroundColor: '#0B0B0F',
    cacheBust: true,
    style: {
      // Ensure dimensions are exact during capture
      width: '1080px',
      height: '1350px',
      transform: 'none',
    }
  });
  
  return dataUrl;
}

/**
 * Common logic to generate a PDF of teams using the same image composition.
 */
export async function generateTeamsPDFFromImage(imageDataUrl: string, fileName: string) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Calculate aspect ratio to fit image in A4 without distortion
  // 1080x1350 is 4:5
  const imgWidth = 190; // Fixed width in mm
  const imgHeight = (imgWidth * 1350) / 1080;
  
  // Center vertically and horizontally
  const x = (pageWidth - imgWidth) / 2;
  const y = (pageHeight - imgHeight) / 2;

  doc.addImage(imageDataUrl, 'PNG', x, y, imgWidth, imgHeight);
  doc.save(fileName);
}

export function dataUrlToPngFile(dataUrl: string, fileName: string): File {
  const parts = dataUrl.split(",");
  const meta = parts[0] ?? "";
  const base64 = parts[1] ?? "";
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function sharePngWithFallback({
  dataUrl,
  fileName,
  title,
  text,
}: {
  dataUrl: string;
  fileName: string;
  title: string;
  text: string;
}): Promise<TeamShareFileResult> {
  const file = dataUrlToPngFile(dataUrl, fileName);
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
    clipboard?: Clipboard;
  };

  try {
    const shareData: ShareData = { title, text, files: [file] };
    if (nav.share && (!nav.canShare || nav.canShare(shareData))) {
      await nav.share(shareData);
      return { ok: true, mode: "web-share", message: "Escalação compartilhada." };
    }
  } catch (error) {
    console.warn("[sharePngWithFallback] Web Share falhou:", error);
  }

  try {
    downloadDataUrl(dataUrl, fileName);
    return { ok: true, mode: "download", message: "PNG baixado. Compartilhe o arquivo manualmente." };
  } catch (error) {
    console.warn("[sharePngWithFallback] Download falhou:", error);
  }

  try {
    if (nav.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return { ok: false, mode: "text", message: "Falha ao gerar arquivo. Texto da escalação copiado como alternativa." };
    }
  } catch (error) {
    console.warn("[sharePngWithFallback] Cópia de texto falhou:", error);
  }

  return { ok: false, mode: "text", message: "Não foi possível compartilhar, baixar ou copiar a escalação." };
}
