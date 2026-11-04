import { analysisSchema, describeIssues, type Analysis } from '../lib/schema';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export class AnalyzeError extends Error {}

interface WorkerResponse {
  raw?: string;
  error?: string;
}

async function requestModel(
  fileName: string,
  pages: number,
  text: string,
  previousError?: string,
): Promise<string> {
  if (!API_URL) {
    throw new AnalyzeError('Brak konfiguracji VITE_API_URL. Aplikacja nie wie, gdzie wyslac zadanie.');
  }

  const response = await fetch(`${API_URL.replace(/\/$/, '')}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, pages, text, previousError }),
  });

  const payload = (await response.json().catch(() => ({}))) as WorkerResponse;
  if (!response.ok || !payload.raw) {
    throw new AnalyzeError(payload.error ?? 'Usluga analizy jest chwilowo niedostepna.');
  }
  return payload.raw;
}

/** Usuwa ewentualne ogrodzenie ```json, gdyby model je dodal mimo instrukcji. */
function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

/**
 * Analizuje dokument i waliduje odpowiedz schematem (F-04).
 * Przy niepoprawnej odpowiedzi wykonuje DOKLADNIE jedna ponowna probe,
 * przekazujac modelowi bledy walidacji — tak wymaga sekcja 04 briefu.
 */
export async function analyzeDocument(
  fileName: string,
  pages: number,
  text: string,
): Promise<Analysis> {
  let previousError: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestModel(fileName, pages, text, previousError);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(raw));
    } catch {
      previousError = 'Odpowiedz nie byla poprawnym JSON-em.';
      continue;
    }

    const result = analysisSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    previousError = describeIssues(result.error);
  }

  throw new AnalyzeError(
    `Model nie zwrocil danych zgodnych ze schematem. Szczegoly: ${previousError ?? 'brak'}`,
  );
}
