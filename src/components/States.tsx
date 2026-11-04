interface LoadingViewProps {
  label: string;
}

export function LoadingView({ label }: LoadingViewProps): JSX.Element {
  return (
    <section className="state" aria-live="polite" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </section>
  );
}

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps): JSX.Element {
  return (
    <section className="state alert alert--error" role="alert">
      <strong>Nie udalo sie przeanalizowac dokumentu</strong>
      <p>{message}</p>
      <button type="button" className="primary" onClick={onRetry}>
        Sprobuj ponownie
      </button>
    </section>
  );
}

export function EmptyView(): JSX.Element {
  return (
    <section className="state state--empty">
      <p>
        Nie przeanalizowano jeszcze zadnego dokumentu. Wgraj PDF, a otrzymasz podsumowanie i dane w
        formacie JSON.
      </p>
    </section>
  );
}
