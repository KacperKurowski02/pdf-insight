import type { Analysis } from './schema';

const STORAGE_KEY = 'pdf-insight.history.v1';
const MAX_ENTRIES = 5;

export interface HistoryEntry {
  id: string;
  savedAt: string;
  analysis: Analysis;
}

/** Historia analiz w localStorage (F-09). Kazdy odczyt jest defensywny — dane moga byc stare lub uszkodzone. */
export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(analysis: Analysis): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: `${Date.now()}`,
    savedAt: new Date().toISOString(),
    analysis,
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Brak miejsca lub tryb prywatny — historia jest wygoda, nie funkcja krytyczna.
  }
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // jw.
  }
}
