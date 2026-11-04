import type { Analysis, Amount } from './schema';

/**
 * Obsluga dlugich dokumentow (F-08) — podzial tekstu i scalanie wynikow.
 *
 * Model analizuje kazdy fragment osobno (faza "map"), a wyniki trzeba potem
 * polaczyc w jeden obiekt (faza "reduce"). Encje, kwoty, daty i slowa kluczowe
 * scalamy deterministycznie, z deduplikacja. Podsumowanie i punkty kluczowe
 * powstaja w osobnym przebiegu modelu — patrz src/api/analyze.ts.
 */

/** Powyzej tylu znakow dokument jest dzielony na fragmenty. */
export const CHUNK_CHARS = 50_000;
/** Zakladka miedzy fragmentami, zeby nie zgubic zdania przecietego na granicy. */
export const CHUNK_OVERLAP = 2_000;

/**
 * Dzieli tekst na fragmenty z zakladka. Granice staramy sie ustawic na koncu
 * akapitu lub zdania, zeby model nie dostawal urwanego w polowie wyrazu.
 */
export function splitText(text: string, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= size) {
    return [text];
  }
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
      // Przesuwamy granice tylko wtedy, gdy wypada w drugiej polowie fragmentu —
      // inaczej powstalyby bardzo krotkie kawalki.
      if (cut > size / 2) {
        end = start + cut + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.filter((c) => c.length > 0);
}

/** Usuwa duplikaty bez wzgledu na wielkosc liter, zachowujac pierwotna kolejnosc. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(v.trim());
    }
  }
  return out;
}

function dedupeAmounts(values: Amount[]): Amount[] {
  const seen = new Set<string>();
  const out: Amount[] = [];
  for (const a of values) {
    const key = `${a.value}|${a.currency}|${a.context.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

function dedupeDates(values: Analysis['dates']): Analysis['dates'] {
  const seen = new Set<string>();
  const out: Analysis['dates'] = [];
  for (const d of values) {
    const key = `${d.date}|${d.context.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

/**
 * Laczy czesciowe analizy fragmentow w jeden wynik.
 * `summary` i `keyPoints` pochodzia z osobnego przebiegu modelu i sa podawane z zewnatrz.
 */
export function mergeAnalyses(
  parts: Analysis[],
  summary: string,
  keyPoints: string[],
): Analysis {
  if (parts.length === 0) {
    throw new Error('Brak wynikow czastkowych do scalenia.');
  }
  const first = parts[0] as Analysis;

  // Typ dokumentu ustalamy wiekszoscia glosow fragmentow.
  const typeCounts = new Map<Analysis['document']['type'], number>();
  for (const p of parts) {
    typeCounts.set(p.document.type, (typeCounts.get(p.document.type) ?? 0) + 1);
  }
  const type = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? first.document.type;

  // Tytul i date bierzemy z pierwszego fragmentu, ktory je zawiera — naglowek
  // dokumentu znajduje sie na poczatku, wiec to najbardziej wiarygodne zrodlo.
  const title = parts.find((p) => p.document.title !== null)?.document.title ?? null;
  const date = parts.find((p) => p.document.date !== null)?.document.date ?? null;

  const notices = dedupe(
    parts.map((p) => p.securityNotice).filter((n): n is string => typeof n === 'string'),
  );

  return {
    document: { ...first.document, type, title, date },
    summary,
    keyPoints: keyPoints.slice(0, 7),
    entities: {
      organizations: dedupe(parts.flatMap((p) => p.entities.organizations)),
      people: dedupe(parts.flatMap((p) => p.entities.people)),
    },
    amounts: dedupeAmounts(parts.flatMap((p) => p.amounts)),
    dates: dedupeDates(parts.flatMap((p) => p.dates)),
    keywords: dedupe(parts.flatMap((p) => p.keywords)),
    securityNotice: notices.length > 0 ? notices.join(' ') : null,
  };
}
