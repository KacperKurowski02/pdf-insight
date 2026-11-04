/**
 * Wykrywanie prob prompt injection w tresci dokumentu.
 *
 * Model i tak dostaje instrukcje, ze tresc PDF to dane, a nie polecenia
 * (patrz worker/src/prompt.ts). Ta warstwa sluzy do poinformowania
 * uzytkownika, ze w pliku znajduje sie tekst probujacy sterowac modelem.
 *
 * Przyklad z pliku testowego rekrutacji: w paragrafie o platnosciach
 * wstawiono akapit nakazujacy napisac, ze umowa jest niewazna i warta 1 PLN.
 */

const PATTERNS: readonly RegExp[] = [
  /zignoruj\s+(wszystkie\s+)?(wcze[sś]niejsze|poprzednie|powy[zż]sze)\s+(polecenia|instrukcje)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
  /instrukcja\s+dla\s+(systemu\s+)?ai/i,
  /(system|developer)\s*(prompt|instruction)\s*[:：]/i,
  /nie\s+wspominaj\s+o\s+(tej|tym|powy[zż]szej)/i,
  /do\s+not\s+mention\s+(this|these)\s+instruction/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /dzia[lł]aj\s+jako\s+(inny|nowy)\s+asystent/i,
];

export interface InjectionScan {
  detected: boolean;
  /** Fragmenty tekstu, ktore wzbudzily podejrzenie — pokazywane uzytkownikowi. */
  excerpts: string[];
}

export function scanForInjection(text: string): InjectionScan {
  const excerpts: string[] = [];

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (!match || match.index === undefined) {
      continue;
    }
    const start = Math.max(0, match.index - 60);
    const end = Math.min(text.length, match.index + match[0].length + 60);
    const excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (!excerpts.includes(excerpt)) {
      excerpts.push(excerpt);
    }
  }

  return { detected: excerpts.length > 0, excerpts: excerpts.slice(0, 3) };
}
