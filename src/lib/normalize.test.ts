import { describe, expect, it } from 'vitest';
import { normalizeAnalysis, toIsoDate } from './normalize';

describe('toIsoDate', () => {
  it('przepuszcza poprawna date ISO', () => {
    expect(toIsoDate('2026-04-01')).toBe('2026-04-01');
  });

  it('konwertuje polski format DD.MM.RRRR', () => {
    expect(toIsoDate('12.10.2026')).toBe('2026-10-12');
    expect(toIsoDate('1.4.2026')).toBe('2026-04-01');
  });

  it('konwertuje format z ukosnikami', () => {
    expect(toIsoDate('31/03/2028')).toBe('2028-03-31');
  });

  it('odrzuca date niepelna', () => {
    expect(toIsoDate('2026-04')).toBeNull();
  });

  it('odrzuca opis slowny', () => {
    expect(toIsoDate('14 dni od wystawienia faktury')).toBeNull();
  });

  it('odrzuca date nieistniejaca', () => {
    expect(toIsoDate('31.02.2026')).toBeNull();
    expect(toIsoDate('2026-13-01')).toBeNull();
  });

  it('odrzuca wartosci niebedace tekstem', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(20260401)).toBeNull();
  });
});

describe('normalizeAnalysis', () => {
  it('normalizuje date dokumentu', () => {
    const out = normalizeAnalysis({ document: { date: '01.04.2026' } }) as {
      document: { date: string | null };
    };
    expect(out.document.date).toBe('2026-04-01');
  });

  it('zeruje date dokumentu, ktorej nie da sie odczytac', () => {
    const out = normalizeAnalysis({ document: { date: 'brak' } }) as {
      document: { date: string | null };
    };
    expect(out.document.date).toBeNull();
  });

  it('konwertuje daty na liscie i usuwa pozycje nieczytelne', () => {
    const out = normalizeAnalysis({
      dates: [
        { date: '12.10.2026', context: 'go-live' },
        { date: '2026-04-01', context: 'start umowy' },
        { date: '2027-04', context: 'zmiana abonamentu' },
        { date: 'co miesiac', context: 'platnosc' },
      ],
    }) as { dates: { date: string; context: string }[] };

    expect(out.dates).toEqual([
      { date: '2026-10-12', context: 'go-live' },
      { date: '2026-04-01', context: 'start umowy' },
    ]);
  });

  it('nie wywraca sie na danych o nieoczekiwanym ksztalcie', () => {
    expect(normalizeAnalysis(null)).toBeNull();
    expect(normalizeAnalysis('tekst')).toBe('tekst');
  });
});
