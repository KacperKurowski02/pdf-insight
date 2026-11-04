import { analysisSchema, describeIssues, type Analysis } from '../lib/schema';
import { normalizeAnalysis } from '../lib/normalize';
import { CHUNK_CHARS, mergeAnalyses, splitText } from '../lib/merge';

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
 * Analizuje jeden fragment tekstu i waliduje odpowiedz schematem (F-04).
 * Przy niepoprawnej odpowiedzi wykonuje DOKLADNIE jedna ponowna probe,
 * przekazujac modelowi bledy walidacji — tak wymaga sekcja 04 briefu.
 */
async function analyzeChunk(
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

export interface AnalyzeProgress {
  (done: number, total: number): void;
}

/**
 * Analizuje dokument (F-08).
 *
 * Krotki tekst idzie w jednym zapytaniu. Dluzszy jest dzielony na fragmenty
 * z zakladka: kazdy analizowany osobno (faza "map"), a nastepnie encje, kwoty,
 * daty i slowa kluczowe scalane deterministycznie. Podsumowanie i punkty
 * kluczowe powstaja w dodatkowym przebiegu modelu na polaczonych podsumowaniach
 * czastkowych — inaczej byloby to zlepkiem zdan, a nie streszczeniem calosci.
 */
export async function analyzeDocument(
  fileName: string,
  pages: number,
  text: string,
  onProgress?: AnalyzeProgress,
): Promise<Analysis> {
  const chunks = splitText(text);

  if (chunks.length === 1) {
    onProgress?.(1, 1);
    return analyzeChunk(fileName, pages, text);
  }

  const parts: Analysis[] = [];
  for (const [index, chunk] of chunks.entries()) {
    onProgress?.(index + 1, chunks.length + 1);
    parts.push(await analyzeChunk(fileName, pages, chunk));
  }

  onProgress?.(chunks.length + 1, chunks.length + 1);
  const digest = parts.map((p, i) => `Fragment ${i + 1}: ${p.summary}`).join('\n\n');
  const reduced = await analyzeChunk(fileName, pages, digest);

  return mergeAnalyses(parts, reduced.summary, reduced.keyPoints);
}

export { CHUNK_CHARS };
