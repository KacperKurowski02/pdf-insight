import { z } from 'zod';

/**
 * Schemat wyniku analizy — odwzorowuje sekcje 04 briefu.
 * To jedyne zrodlo prawdy: z niego generujemy opis dla modelu
 * i nim walidujemy odpowiedz PRZED wyswietleniem (wymog F-04).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_LANG = /^[a-z]{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

export const DOCUMENT_TYPES = ['faktura', 'umowa', 'oferta', 'raport', 'inne'] as const;

const isoDate = z.string().regex(ISO_DATE, 'Data musi byc w formacie ISO 8601 (RRRR-MM-DD)');

export const documentMetaSchema = z.object({
  fileName: z.string().min(1),
  pages: z.number().int().positive(),
  language: z.string().regex(ISO_LANG, 'Jezyk musi byc kodem ISO 639-1'),
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().min(1).nullable(),
  date: isoDate.nullable(),
});

export const amountSchema = z.object({
  value: z.number(),
  currency: z.string().regex(ISO_CURRENCY, 'Waluta musi byc kodem ISO 4217'),
  context: z.string().min(1),
});

export const datedItemSchema = z.object({
  date: isoDate,
  context: z.string().min(1),
});

export const analysisSchema = z.object({
  document: documentMetaSchema,
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(7),
  entities: z.object({
    organizations: z.array(z.string().min(1)),
    people: z.array(z.string().min(1)),
  }),
  amounts: z.array(amountSchema),
  dates: z.array(datedItemSchema),
  keywords: z.array(z.string().min(1)),
  /**
   * Pole wlasne — brief pozwala dodawac pola, zabrania usuwac.
   * Sygnalizuje, ze w dokumencie wykryto probe prompt injection.
   */
  securityNotice: z.string().nullable().default(null),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type DocumentMeta = z.infer<typeof documentMetaSchema>;
export type Amount = z.infer<typeof amountSchema>;

/** Zwraca czytelna liste bledow walidacji — uzywana w komunikacie dla modelu przy ponowieniu. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}
