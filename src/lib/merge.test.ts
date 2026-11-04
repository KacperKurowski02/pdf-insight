import { describe, expect, it } from 'vitest';
import { CHUNK_CHARS, mergeAnalyses, splitText } from './merge';
import type { Analysis } from './schema';

function part(over: Partial<Analysis> = {}): Analysis {
  return {
    document: { fileName: 'a.pdf', pages: 40, language: 'pl', type: 'umowa', title: null, date: null },
    summary: 'x',
    keyPoints: ['a', 'b', 'c'],
    entities: { organizations: [], people: [] },
    amounts: [],
    dates: [],
    keywords: [],
    securityNotice: null,
    ...over,
  };
}

describe('splitText', () => {
  it('nie dzieli krotkiego tekstu', () => {
    expect(splitText('krotki tekst')).toEqual(['krotki tekst']);
  });

  it('dzieli dlugi tekst na kilka fragmentow', () => {
    const chunks = splitText('a'.repeat(CHUNK_CHARS * 3));
    expect(chunks.length).toBeGreaterThan(2);
  });

  it('fragmenty pokrywaja caly tekst', () => {
    const text = Array.from({ length: 4000 }, (_, i) => `Zdanie numer ${i}.`).join(' ');
    const chunks = splitText(text, 5000, 200);
    expect(chunks.join('')).toContain('Zdanie numer 0');
    expect(chunks.join('')).toContain('Zdanie numer 3999');
  });

  it('tnie na granicy zdania, a nie w polowie wyrazu', () => {
    const text = `${'Pierwsze zdanie. '.repeat(500)}${'Drugie zdanie. '.repeat(500)}`;
    const chunks = splitText(text, 4000, 100);
    expect(chunks[0]?.endsWith('.')).toBe(true);
  });

  it('nie zwraca pustych fragmentow', () => {
    expect(splitText('b'.repeat(130_000), 20_000, 500).every((c) => c.length > 0)).toBe(true);
  });
});

describe('mergeAnalyses', () => {
  it('odrzuca pusta liste', () => {
    expect(() => mergeAnalyses([], 's', ['a', 'b', 'c'])).toThrow();
  });

  it('deduplikuje encje bez wzgledu na wielkosc liter', () => {
    const out = mergeAnalyses(
      [
        part({ entities: { organizations: ['Alfa sp. z o.o.', 'Beta S.A.'], people: ['Jan Nowak'] } }),
        part({ entities: { organizations: ['ALFA SP. Z O.O.'], people: ['Jan Nowak'] } }),
      ],
      's',
      ['a', 'b', 'c'],
    );
    expect(out.entities.organizations).toEqual(['Alfa sp. z o.o.', 'Beta S.A.']);
    expect(out.entities.people).toEqual(['Jan Nowak']);
  });

  it('deduplikuje identyczne kwoty, zachowujac rozne konteksty', () => {
    const out = mergeAnalyses(
      [
        part({ amounts: [{ value: 100, currency: 'PLN', context: 'kara' }] }),
        part({
          amounts: [
            { value: 100, currency: 'PLN', context: 'kara' },
            { value: 100, currency: 'PLN', context: 'zaliczka' },
          ],
        }),
      ],
      's',
      ['a', 'b', 'c'],
    );
    expect(out.amounts).toHaveLength(2);
  });

  it('bierze tytul i date z pierwszego fragmentu, ktory je ma', () => {
    const out = mergeAnalyses(
      [
        part(),
        part({ document: { ...part().document, title: 'Umowa nr 1', date: '2026-01-01' } }),
      ],
      's',
      ['a', 'b', 'c'],
    );
    expect(out.document.title).toBe('Umowa nr 1');
    expect(out.document.date).toBe('2026-01-01');
  });

  it('ustala typ dokumentu wiekszoscia glosow', () => {
    const faktura = part({ document: { ...part().document, type: 'faktura' } });
    const out = mergeAnalyses([faktura, faktura, part()], 's', ['a', 'b', 'c']);
    expect(out.document.type).toBe('faktura');
  });

  it('laczy ostrzezenia o manipulacji i pomija puste', () => {
    const out = mergeAnalyses(
      [part({ securityNotice: 'Wykryto probe.' }), part(), part({ securityNotice: 'Wykryto probe.' })],
      's',
      ['a', 'b', 'c'],
    );
    expect(out.securityNotice).toBe('Wykryto probe.');
  });

  it('zwraca null, gdy zaden fragment nie zglosil manipulacji', () => {
    expect(mergeAnalyses([part(), part()], 's', ['a', 'b', 'c']).securityNotice).toBeNull();
  });

  it('przycina punkty kluczowe do siedmiu', () => {
    const kp = Array.from({ length: 12 }, (_, i) => `punkt ${i}`);
    expect(mergeAnalyses([part()], 's', kp).keyPoints).toHaveLength(7);
  });
});
