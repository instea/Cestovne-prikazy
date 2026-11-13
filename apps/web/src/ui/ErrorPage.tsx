import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">{t('app.errorTitle')}</h1>
      <button
        type="button"
        className="rounded bg-slate-800 px-4 py-2 text-white"
        onClick={() => window.location.reload()}
      >
        {t('app.reload')}
      </button>
    </div>
  );
}

/** Catches render errors outside the router (the router has its own errorElement). */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <ErrorPage /> : this.props.children;
  }
}
