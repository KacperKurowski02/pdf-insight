import * as pdfjs from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
// Vite rozwiazuje sciezke do workera w czasie builda — dzieki temu dziala
// takze pod podkatalogiem GitHub Pages (pulapka z sekcji 03 briefu).
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class PdfError extends Error {}

/** Dokument bez warstwy tekstowej — wolajacy moze sprobowac OCR (F-10). */
export class NoTextLayerError extends PdfError {}

export interface ExtractedPdf {
  text: string;
  pages: number;
}

/** Walidacja pliku po stronie klienta — typ, rozmiar i sygnatura %PDF-. */
export async function validatePdfFile(file: File): Promise<void> {
  if (file.size === 0) {
    throw new PdfError('Plik jest pusty.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new PdfError('Plik jest wiekszy niz 10 MB. Wybierz mniejszy dokument.');
  }
  // Sam typ MIME latwo podmienic, wiec sprawdzamy naglowek pliku.
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...header);
  if (signature !== '%PDF-') {
    throw new PdfError('To nie jest plik PDF. Akceptujemy wylacznie dokumenty PDF.');
  }
}

/** Wyciaga warstwe tekstowa z pliku PDF. Parsowanie zostaje w przegladarce. */
export async function extractPdfText(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractedPdf> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  try {
    const chunks: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => item.str)
        .join(' ');
      chunks.push(pageText);
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages);
    }

    const text = chunks.join('\n\n').replace(/[ \t]+/g, ' ').trim();
    if (text.length < 30) {
      throw new NoTextLayerError('Ten PDF nie zawiera warstwy tekstowej (prawdopodobnie skan).');
    }
    return { text, pages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}
