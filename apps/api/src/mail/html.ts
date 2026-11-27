/**
 * NOT-01 template helpers: every interpolated user value is HTML-escaped,
 * so a first name `<b>x</b>` shows as literal text in the email.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Markup that is already safe; `html` inserts it without escaping. */
export class SafeHtml {
  constructor(private readonly value: string) {}

  toString(): string {
    return this.value;
  }
}

export type HtmlValue =
  SafeHtml | string | number | null | undefined | readonly HtmlValue[];

function render(value: HtmlValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

/** Tagged template: literal parts are markup, `${values}` are escaped. */
export function html(
  strings: TemplateStringsArray,
  ...values: HtmlValue[]
): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}
