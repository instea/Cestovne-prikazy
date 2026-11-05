import { describe, expect, it } from 'vitest';
import { escapeHtml, html, SafeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('leaves plain and non-ASCII text unchanged', () => {
    expect(escapeHtml('Jana Nová')).toBe('Jana Nová');
  });

  it('escapes already-escaped text again (no double-decoding)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

describe('html', () => {
  it('escapes interpolated values, keeps the template markup', () => {
    const firstName = '<b>x</b>';
    expect(html`<p>Hello ${firstName}</p>`.toString()).toBe(
      '<p>Hello &lt;b&gt;x&lt;/b&gt;</p>',
    );
  });

  it('stringifies numbers and drops null / undefined', () => {
    expect(html`${1.5}|${null}|${undefined}`.toString()).toBe('1.5||');
  });

  it('nests SafeHtml fragments without re-escaping them', () => {
    const inner = html`<i>${'a&b'}</i>`;
    expect(html`<p>${inner}</p>`.toString()).toBe('<p><i>a&amp;b</i></p>');
  });

  it('joins arrays, escaping each item', () => {
    const items = ['<x>', html`<li>ok</li>`];
    // Prettier formats `html` templates as markup; keep this one inline.
    // prettier-ignore
    const list = html`<ul>${items}</ul>`;
    expect(list.toString()).toBe('<ul>&lt;x&gt;<li>ok</li></ul>');
  });

  it('returns a SafeHtml', () => {
    expect(html`x`).toBeInstanceOf(SafeHtml);
    expect(String(html`x`)).toBe('x');
  });
});
