import { useMemo, useState } from 'react';
import type { Analysis } from '../lib/schema';

interface ResultViewProps {
  analysis: Analysis;
  injectionExcerpts: string[];
  /** Komunikat o uzyciu OCR, gdy dokument nie mial warstwy tekstowej. */
  ocrNotice?: string | null;
}

function formatAmount(value: number, currency: string): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value);
}

export function ResultView({ analysis, injectionExcerpts, ocrNotice }: ResultViewProps): JSX.Element {
  const [showJson, setShowJson] = useState(false);
  const json = useMemo(() => JSON.stringify(analysis, null, 2), [analysis]);

  const download = (): void => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${analysis.document.fileName.replace(/\.pdf$/i, '')}-analiza.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const warned = injectionExcerpts.length > 0 || analysis.securityNotice !== null;

  return (
    <section className="result" aria-live="polite">
      {ocrNotice && (
        <p className="alert alert--info" role="status">
          {ocrNotice}
        </p>
      )}

      {warned && (
        <div className="alert alert--warning" role="alert">
          <strong>Wykryto probe manipulacji modelem.</strong>
          <p>
            Dokument zawiera tresc przypominajaca polecenie skierowane do systemu AI. Zostala
            zignorowana — analiza ponizej opiera sie wylacznie na faktycznej tresci dokumentu.
          </p>
          {analysis.securityNotice !== null && <p>{analysis.securityNotice}</p>}
          {injectionExcerpts.map((excerpt) => (
            <p className="alert__excerpt" key={excerpt}>
              {excerpt}
            </p>
          ))}
        </div>
      )}

      <header className="result__header">
        <h2>{analysis.document.title ?? analysis.document.fileName}</h2>
        <ul className="meta">
          <li>Typ: {analysis.document.type}</li>
          <li>Jezyk: {analysis.document.language}</li>
          <li>Stron: {analysis.document.pages}</li>
          <li>Data: {analysis.document.date ?? 'brak'}</li>
        </ul>
      </header>

      <h3>Podsumowanie</h3>
      <p>{analysis.summary}</p>

      <h3>Punkty kluczowe</h3>
      <ul>
        {analysis.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <div className="grid">
        <div>
          <h3>Organizacje</h3>
          {analysis.entities.organizations.length === 0 ? (
            <p className="muted">Brak</p>
          ) : (
            <ul>
              {analysis.entities.organizations.map((org) => (
                <li key={org}>{org}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Osoby</h3>
          {analysis.entities.people.length === 0 ? (
            <p className="muted">Brak</p>
          ) : (
            <ul>
              {analysis.entities.people.map((person) => (
                <li key={person}>{person}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>Kwoty</h3>
      {analysis.amounts.length === 0 ? (
        <p className="muted">Brak</p>
      ) : (
        <ul>
          {analysis.amounts.map((amount) => (
            <li key={`${amount.value}-${amount.context}`}>
              <strong>{formatAmount(amount.value, amount.currency)}</strong> — {amount.context}
            </li>
          ))}
        </ul>
      )}

      <h3>Daty</h3>
      {analysis.dates.length === 0 ? (
        <p className="muted">Brak</p>
      ) : (
        <ul>
          {analysis.dates.map((item) => (
            <li key={`${item.date}-${item.context}`}>
              <strong>{item.date}</strong> — {item.context}
            </li>
          ))}
        </ul>
      )}

      <h3>Slowa kluczowe</h3>
      <p>{analysis.keywords.join(', ') || 'brak'}</p>

      <div className="actions">
        <button type="button" onClick={() => setShowJson((value) => !value)}>
          {showJson ? 'Ukryj JSON' : 'Podglad JSON'}
        </button>
        <button type="button" className="primary" onClick={download}>
          Pobierz .json
        </button>
      </div>

      {showJson && <pre className="json">{json}</pre>}
    </section>
  );
}
