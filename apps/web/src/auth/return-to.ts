/** Same-app relative path (`/x`, not `//x`), else `/leaves` (AUTH-01). */
export function safeReturnTo(value: string | null): string {
  if (
    value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  ) {
    return value;
  }
  return '/leaves';
}
