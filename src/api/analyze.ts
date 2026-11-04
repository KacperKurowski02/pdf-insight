import { analysisSchema, describeIssues, type Analysis } from '../lib/schema';
import { normalizeAnalysis } from '../lib/normalize';

/**
 * Adres backendu. Zmienna srodowiskowa ma pierwszenstwo (praca lokalna, wlasny hosting),
 * a wartosc domyslna wskazuje publicznego Workera obslugujacego demo. Adres endpointu
 * nie jest sekretem — klucz API pozostaje wylacznie po stronie Workera.
 */
const DEFAULT_API_URL = 'https://pdf-insight-api.kacperkurowski.workers.dev';
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || DEFAULT_API_URL;

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

    // Normalizacja dat przed walidacja — szczegoly w src/lib/normalize.ts.
    const result = analysisSchema.safeParse(normalizeAnalysis(parsed));
    if (result.success) {
      return result.data;
    }
    previousError = describeIssues(result.error);
  }

  throw new AnalyzeError(
    `Model nie zwrocil danych zgodnych ze schematem. Szczegoly: ${previousError ?? 'brak'}`,
  );
}
