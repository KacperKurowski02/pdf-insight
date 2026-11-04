import { describe, expect, it } from 'vitest';
import { analysisSchema, describeIssues } from './schema';

const valid = {
  document: {
    fileName: 'umowa.pdf',
    pages: 12,
    language: 'pl',
    type: 'umowa',
    title: 'Umowa ramowa nr 14/2026',
    date: '2026-03-12',
  },
  summary: 'Umowa okresla zasady wdrozenia systemu CRM.',
  keyPoints: ['Okres umowy 24 miesiace', 'Go-live 12.10.2026', 'SLA 99,5%'],
  entities: {
    organizations: ['Nordwave Logistics sp. z o.o.', 'Kwadrat Software S.A.'],
    people: ['Anna Kowalczyk'],
  },
  amounts: [{ value: 184500, currency: 'PLN', context: 'wynagrodzenie za wdrozenie' }],
  dates: [{ date: '2026-10-12', context: 'go-live' }],
  keywords: ['CRM', 'SLA', 'wdrozenie'],
  securityNotice: null,
};

describe('analysisSchema', () => {
  it('przyjmuje poprawny obiekt', () => {
    expect(analysisSchema.parse(valid)).toMatchObject({ summary: valid.summary });
  });

  it('uzupelnia securityNotice wartoscia null, gdy pole nie przyszlo', () => {
    const { securityNotice: _omitted, ...withoutNotice } = valid;
    expect(analysisSchema.parse(withoutNotice).securityNotice).toBeNull();
  });

  it('odrzuca brakujace pole wymagane', () => {
    const { summary: _omitted, ...broken } = valid;
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('odrzuca date spoza ISO 8601', () => {
    const broken = { ...valid, document: { ...valid.document, date: '12.03.2026' } };
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('przyjmuje date rowna null', () => {
    const noDate = { ...valid, document: { ...valid.document, date: null } };
    expect(analysisSchema.safeParse(noDate).success).toBe(true);
  });

  it('odrzuca walute spoza ISO 4217', () => {
    const broken = { ...valid, amounts: [{ value: 1, currency: 'zl', context: 'test' }] };
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('odrzuca typ dokumentu spoza listy', () => {
    const broken = { ...valid, document: { ...valid.document, type: 'protokol' } };
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('odrzuca mniej niz 3 punkty kluczowe', () => {
    const broken = { ...valid, keyPoints: ['jeden', 'dwa'] };
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('odrzuca wiecej niz 7 punktow kluczowych', () => {
    const broken = { ...valid, keyPoints: Array.from({ length: 8 }, (_, i) => `punkt ${i}`) };
    expect(analysisSchema.safeParse(broken).success).toBe(false);
  });

  it('dopuszcza puste tablice encji', () => {
    const empty = { ...valid, entities: { organizations: [], people: [] }, amounts: [], dates: [] };
    expect(analysisSchema.safeParse(empty).success).toBe(true);
  });

  it('opisuje bledy w czytelnej formie', () => {
    const result = analysisSchema.safeParse({ ...valid, summary: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(describeIssues(result.error)).toContain('summary');
    }
  });
});
