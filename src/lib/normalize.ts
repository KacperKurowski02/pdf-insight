/**
 * Normalizacja odpowiedzi modelu przed walidacja schematem.
 *
 * Prompt wymaga dat w ISO 8601, ale model analizujacy polski dokument regularnie
 * zwraca czesc pozycji w formacie `DD.MM.RRRR`, a czasem date niepelna (`RRRR-MM`).
 * Odrzucanie calej analizy z powodu kilku takich pozycji byloby zla wymiana, dlatego
 * najpierw sprowadzamy co sie da do ISO, a pozycje niemozliwe do jednoznacznego
 * odczytania pomijamy. Schemat pozostaje rygorystyczny — zmienia sie tylko to,
 * co do niego trafia.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Zwraca date w formacie ISO 8601 albo null, gdy nie da sie jej jednoznacznie odczytac. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const raw = value.trim();

  const iso = ISO.exec(raw);
  if (iso) {
    const [, y, m, d] = iso;
    return isRealDate(Number(y), Number(m), Number(d)) ? raw : null;
  }

  const dmy = DMY.exec(raw);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (!isRealDate(year, month, day)) {
      return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Data niepelna (sam miesiac i rok) albo opis slowny — zgodnie z brief'em pomijamy.
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Przepuszcza surowa odpowiedz modelu przez normalizacje dat.
 * Nie waliduje — to zadanie schematu Zod, ktory dziala na wyniku tej funkcji.
 */
export function normalizeAnalysis(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }
  const out: Record<string, unknown> = { ...input };

  if (isRecord(out.document)) {
    out.document = { ...out.document, date: toIsoDate(out.document.date) };
  }

  if (Array.isArray(out.dates)) {
    out.dates = out.dates
      .map((item) => (isRecord(item) ? { ...item, date: toIsoDate(item.date) } : item))
      .filter((item): item is Record<string, unknown> => isRecord(item) && item.date !== null);
  }

  return out;
}
