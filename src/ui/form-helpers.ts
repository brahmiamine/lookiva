'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { ApiError, retryMinutes } from './api-client';
import type { NoticeTone } from './components/Notice';

export type NoticeData = { tone: NoticeTone; title: string; text?: string };

/** Generic notice for failures a form does not handle itself: network, 429 (with the wait), 503, anything else. */
export function useErrorNotice() {
  const c = useTranslations('common');
  return useCallback((e: unknown): NoticeData => {
    if (e instanceof ApiError) {
      if (e.code === 'NETWORK_ERROR') return { tone: 'danger', title: c('networkTitle'), text: c('networkText') };
      if (e.status === 429) return { tone: 'warning', title: c('rateLimitedTitle', { minutes: retryMinutes(e) }) };
      if (e.status === 503) return { tone: 'warning', title: c('unavailableTitle'), text: c('unavailableText') };
    }
    return { tone: 'danger', title: c('unexpectedTitle'), text: c('unexpectedText') };
  }, [c]);
}

/** Moves focus to `ref` whenever `trigger` becomes truthy or changes (error notices, new screen headings). */
export function useFocusOn(ref: RefObject<HTMLElement | null>, trigger: unknown) {
  useEffect(() => {
    if (trigger) ref.current?.focus();
  }, [ref, trigger]);
}

/** Seconds left until `until` (epoch ms), re-rendering every second while positive. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** Basic shape check before calling the server (which normalises and validates for real). */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Reads `#token=...` from the URL once and removes the fragment so it stays out of history and copied links. */
export function takeFragmentToken(): string | null {
  const m = /(?:^#|&)token=([A-Za-z0-9_-]{1,256})/.exec(window.location.hash);
  if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  return m?.[1] ?? null;
}
