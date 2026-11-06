import { createContext, useContext } from 'react';

/**
 * AUTH-01: the Google Identity Services (GIS) sign-in button behind a small
 * interface, so tests render a fake button. Playwright (TST-03) can instead
 * serve a fake script at `GIS_SCRIPT_URL` that defines the same
 * `google.accounts.id` subset and calls `callback` with a test ID token.
 */

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export interface GoogleButtonOptions {
  clientId: string;
  /** `hd` hint: Google pre-selects accounts of this hosted domain. */
  hostedDomain: string;
  /** UI language of the button (`en` / `sk`). */
  locale: string;
  onCredential: (idToken: string) => void;
  /** Script load or GIS failure. */
  onError: (error: unknown) => void;
}

export interface GoogleSignIn {
  /** Renders the button into `container`; returns a cleanup function. */
  renderButton(
    container: HTMLElement,
    options: GoogleButtonOptions,
  ): () => void;
}

/** The part of the GIS API used here. */
interface GisApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        hd?: string;
        callback: (response: { credential?: string }) => void;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: Record<string, string | number>,
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GisApi;
  }
}

let scriptLoad: Promise<GisApi> | null = null;

function loadGis(): Promise<GisApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  scriptLoad ??= new Promise<GisApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.google?.accounts?.id
        ? resolve(window.google)
        : reject(new Error('Google Identity Services did not initialise'));
    script.onerror = () => {
      scriptLoad = null; // allow a retry on the next render
      script.remove();
      reject(new Error('Cannot load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/** Real GIS button. */
export const gisSignIn: GoogleSignIn = {
  renderButton(container, options) {
    let active = true;
    loadGis()
      .then((gis) => {
        if (!active) return;
        gis.accounts.id.initialize({
          client_id: options.clientId,
          hd: options.hostedDomain,
          callback: (response) => {
            if (!active) return;
            if (response.credential) options.onCredential(response.credential);
            else options.onError(new Error('Google returned no credential'));
          },
        });
        gis.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          locale: options.locale,
        });
      })
      .catch((e: unknown) => {
        if (active) options.onError(e);
      });
    return () => {
      active = false;
      container.replaceChildren();
    };
  },
};

export const GoogleSignInContext = createContext<GoogleSignIn>(gisSignIn);

export const useGoogleSignIn = (): GoogleSignIn =>
  useContext(GoogleSignInContext);
