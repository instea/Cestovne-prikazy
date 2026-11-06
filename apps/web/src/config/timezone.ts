/**
 * NFR-13: timestamps are shown in the server's `DEFAULT_TIMEZONE`. The web
 * gets it from build config (`VITE_DEFAULT_TIMEZONE`), default as the API.
 */
export const DEFAULT_TIMEZONE: string =
  (import.meta.env.VITE_DEFAULT_TIMEZONE as string | undefined) ||
  'Europe/Bratislava';
