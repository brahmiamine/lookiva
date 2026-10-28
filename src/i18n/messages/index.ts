import { DEFAULT_LOCALE, type Locale } from '../config';
import ar from './ar.json';
import en from './en.json';
import fr from './fr.json';

type Catalog = Record<Locale, Record<string, unknown>>;
const CATALOG: Catalog = { fr, en, ar };

const lookup = (messages: Record<string, unknown>, key: string): string | undefined => {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
};

/** Dotted-key lookup; falls back to the fr value, then to the key itself. Never throws. */
export const getMessage = (locale: Locale, key: string, catalog: Catalog = CATALOG): string =>
  lookup(catalog[locale], key) ?? lookup(catalog[DEFAULT_LOCALE], key) ?? key;

const merge = (base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      typeof v === 'object' && v !== null && typeof b === 'object' && b !== null
        ? merge(b as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
};

// Key shape is fr's (a test keeps en/ar identical), so next-intl keys are type-checked.
export type Messages = typeof fr;

/** Messages handed to next-intl: the locale's JSON laid over fr, so missing keys fall back to French. */
export const messagesFor = (locale: Locale): Messages =>
  merge(CATALOG[DEFAULT_LOCALE], CATALOG[locale]) as Messages;
