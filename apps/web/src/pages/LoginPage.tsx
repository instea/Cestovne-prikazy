import type { SessionDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { api } from '../api/client';
import { ApiError } from '../api/errors';
import { useGoogleSignIn } from '../auth/google-identity';
import { safeReturnTo } from '../auth/return-to';
import { sessionStore } from '../auth/session';
import { useSession } from '../auth/use-session';
import { useRuntimeConfig } from '../config/use-runtime-config';
import { LanguageSelect } from '../i18n/LanguageSelect';
import { FullPageSpinner } from '../ui/Spinner';

type LoginError =
  | typeof ErrorCode.LOGIN_FAILED
  | typeof ErrorCode.WRONG_DOMAIN
  | typeof ErrorCode.USER_DEACTIVATED;

/** AUTH-01: only these get their own text; anything else is a failed login. */
function loginErrorOf(e: unknown): LoginError {
  if (e instanceof ApiError) {
    if (e.code === ErrorCode.WRONG_DOMAIN) return ErrorCode.WRONG_DOMAIN;
    if (e.code === ErrorCode.USER_DEACTIVATED) {
      return ErrorCode.USER_DEACTIVATED;
    }
  }
  return ErrorCode.LOGIN_FAILED;
}

/**
 * AUTH-01 sign-in: the Google button (client id and `hd` hint from
 * `GET /api/auth/config`) posts the ID token to `POST /api/auth/google`;
 * the session then redirects to the sanitized `returnTo`.
 */
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { status, endReason } = useSession();
  const [params] = useSearchParams();
  const config = useRuntimeConfig();
  const google = useGoogleSignIn();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  // Synchronous guard: GIS may deliver a second credential before React
  // re-renders the button as inert.
  const pendingRef = useRef(false);
  const [error, setError] = useState<LoginError | null>(null);
  const showButton = status === 'anonymous';

  useEffect(() => {
    const container = buttonRef.current;
    if (!showButton || !container) return;
    return google.renderButton(container, {
      clientId: config.googleClientId,
      hostedDomain: config.hostedDomain,
      locale: i18n.language,
      onCredential: (idToken) => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(null);
        api<SessionDto>('/auth/google', {
          method: 'POST',
          body: { idToken },
        })
          .then((session) => sessionStore.start(session))
          .catch((e: unknown) => {
            setError(loginErrorOf(e));
            pendingRef.current = false;
            setPending(false);
          });
      },
      onError: () => setError(ErrorCode.LOGIN_FAILED),
    });
  }, [google, config, i18n.language, showButton]);

  if (status === 'unknown') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;
  }
  // A session ended by deactivation shows the same text as a refused login.
  const shown: LoginError | null =
    error ??
    (endReason === ErrorCode.USER_DEACTIVATED
      ? ErrorCode.USER_DEACTIVATED
      : null);
  return (
    <div className="mx-auto mt-8 max-w-sm space-y-4 text-center">
      <LanguageSelect className="justify-end" />
      <h1 className="mt-16 text-2xl font-semibold">{t('login.title')}</h1>
      {shown && (
        <p role="alert" className="rounded bg-red-100 p-3 text-red-700">
          {t(`errors.${shown}`)}
        </p>
      )}
      <div
        className="relative flex min-h-11 justify-center"
        aria-busy={pending}
      >
        {/* The GIS button is a Google iframe and has no disabled state;
            `inert` blocks clicks and keyboard focus inside it. */}
        <div
          ref={buttonRef}
          data-testid="google-button"
          className={pending ? 'pointer-events-none opacity-50' : ''}
          aria-disabled={pending}
          inert={pending}
        />
        {pending && (
          <span
            role="status"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="h-6 w-6 animate-spin rounded-full border-4 border-slate-300 border-t-slate-700" />
            <span className="sr-only">{t('common.loading')}</span>
          </span>
        )}
      </div>
    </div>
  );
}
