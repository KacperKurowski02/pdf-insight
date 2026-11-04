import * as pdfjs from 'pdfjs-dist';

/**
 * OCR dla skanow bez warstwy tekstowej (F-10).
 *
 * Kazda strona jest renderowana na canvas, a nastepnie rozpoznawana przez
 * tesseract.js w jezyku polskim i angielskim. Biblioteka wazy kilka megabajtow
 * i pobiera dane jezykowe dopiero przy uzyciu, dlatego importujemy ja
 * dynamicznie — dokument z warstwa tekstowa nigdy jej nie sciaga.
 */

/** OCR calego, wielostronicowego skanu trwalby zbyt dlugo na demo. */
export const MAX_OCR_PAGES = 10;
/** Wyzsza skala = czytelniejszy obraz dla OCR, kosztem czasu i pamieci. */
const RENDER_SCALE = 2;

export class OcrError extends Error {}

export interface OcrProgress {
  (page: number, total: number): void;
}

async function renderPage(page: pdfjs.PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new OcrError('Przegladarka nie udostepnila kontekstu canvas.');
  }

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

/** Rozpoznaje tekst ze skanu. Zwraca pusty ciag, gdy nic nie udalo sie odczytac. */
export async function extractTextWithOcr(
  file: File,
  onProgress?: OcrProgress,
): Promise<{ text: string; pages: number; ocrPages: number }> {
  const { createWorker } = await import('tesseract.js');

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pagesToRead = Math.min(doc.numPages, MAX_OCR_PAGES);

  const worker = await createWorker(['pol', 'eng']);
  try {
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      onProgress?.(pageNumber, pagesToRead);
      const page = await doc.getPage(pageNumber);
      const canvas = await renderPage(page);
      const { data: result } = await worker.recognize(canvas);
      chunks.push(result.text);
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    const text = chunks.join('\n\n').replace(/[ \t]+/g, ' ').trim();
    if (text.length < 30) {
      throw new OcrError('OCR nie rozpoznal tekstu w tym dokumencie.');
    }
    return { text, pages: doc.numPages, ocrPages: pagesToRead };
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
}
