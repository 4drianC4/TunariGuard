import { existsSync, readFileSync } from 'node:fs';

const source = new URL('../src/shared/i18n/en.json', import.meta.url);
const compiled = new URL('../dist/shared/i18n/en.json', import.meta.url);
const english = JSON.parse(readFileSync(existsSync(source) ? source : compiled, 'utf8'));

export function language() {
  const locale = process.env.TUNARI_LANGUAGE ?? 'es';
  return /^en(?:-|$)/i.test(locale) ? 'en' : 'es';
}

export function t(key) {
  return language() === 'en' && Object.hasOwn(english, key) ? english[key] : key;
}

export function msg(parts, ...values) {
  const key = parts.reduce((text, part, index) => index ? text + '{' + index + '}' + part : part, '');
  return t(key).replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) > 0 && Number(index) <= values.length ? String(values[Number(index) - 1]) : token);
}

export function request(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('Accept-Language', language());
  return fetch(url, { ...options, headers });
}
