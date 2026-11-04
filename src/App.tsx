import { useCallback, useEffect, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ResultView } from './components/ResultView';
import { EmptyView, ErrorView, LoadingView } from './components/States';
import { analyzeDocument } from './api/analyze';
import { PdfError, extractPdfText, validatePdfFile } from './lib/pdf';
import { scanForInjection } from './lib/injection';
import { clearHistory, loadHistory, saveToHistory, type HistoryEntry } from './lib/history';
import type { Analysis } from './lib/schema';

type Status = 'empty' | 'loading' | 'done' | 'error';

export default function App(): JSX.Element {
  const [status, setStatus] = useState<Status>('empty');
  const [progress, setProgress] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [excerpts, setExcerpts] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastFile, setLastFile] = useState<File | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const run = useCallback(async (file: File): Promise<void> => {
    setLastFile(file);
    setStatus('loading');
    setErrorMessage('');

    try {
      setProgress('Sprawdzanie pliku…');
      await validatePdfFile(file);

      setProgress('Odczytywanie tekstu…');
      const { text, pages } = await extractPdfText(file, (done, total) => {
        setProgress(`Odczytywanie tekstu… strona ${done} z ${total}`);
      });

      const scan = scanForInjection(text);
      setExcerpts(scan.excerpts);

      setProgress('Analiza dokumentu…');
      const result = await analyzeDocument(file.name, pages, text);

      setAnalysis(result);
      setHistory(saveToHistory(result));
      setStatus('done');
    } catch (error) {
      const message =
        error instanceof PdfError || error instanceof Error
          ? error.message
          : 'Wystapil nieoczekiwany blad.';
      setErrorMessage(message);
      setStatus('error');
    } finally {
      setProgress('');
    }
  }, []);

  const retry = useCallback(() => {
    if (lastFile) {
      void run(lastFile);
    } else {
      setStatus('empty');
    }
  }, [lastFile, run]);

  return (
    <main className="app">
      <header className="app__header">
        <h1>PDF Insight</h1>
        <p>Wgraj dokument PDF, a otrzymasz krotkie podsumowanie i uporzadkowane dane JSON.</p>
      </header>

      <Dropzone onFile={(file) => void run(file)} disabled={status === 'loading'} />

      <p className="notice">
        Tekst wyciagniety z dokumentu jest wysylany do zewnetrznego API modelu jezykowego w celu
        analizy. Nie wgrywaj dokumentow poufnych.
      </p>

      {status === 'empty' && <EmptyView />}
      {status === 'loading' && <LoadingView label={progress || 'Pracuje…'} />}
      {status === 'error' && <ErrorView message={errorMessage} onRetry={retry} />}
      {status === 'done' && analysis && (
        <ResultView analysis={analysis} injectionExcerpts={excerpts} />
      )}

      {history.length > 0 && (
        <section className="history">
          <h2>Ostatnie analizy</h2>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setAnalysis(entry.analysis);
                    setExcerpts([]);
                    setStatus('done');
                  }}
                >
                  {entry.analysis.document.fileName}
                </button>
                <span className="muted">
                  {' '}
                  — {new Date(entry.savedAt).toLocaleString('pl-PL')}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              clearHistory();
              setHistory([]);
            }}
          >
            Wyczysc historie
          </button>
        </section>
      )}
    </main>
  );
}
