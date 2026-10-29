'use client';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LOCALES, type Locale } from '@/i18n/config';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { FIELD, H1, LEAD, OPTION, SECTION } from '../styles';

type City = { name: string; countryCode: string; latitude: number; longitude: number; timezone: string };
// Endonyms: each language is offered in its own name, with the current UI language as a hint.
const NATIVE: Record<Locale, string> = { fr: 'Français', en: 'English', ar: 'العربية' };

export function Onboarding({ initialStep, timeZones, savedTimeZone }: { initialStep: 1 | 2; timeZones: string[]; savedTimeZone: string | null }) {
  const t = useTranslations('onboarding');
  const c = useTranslations('common');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [step, setStep] = useState(initialStep);
  const [chosen, setChosen] = useState<Locale>(locale);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOn(headingRef, step === 2 && initialStep === 1 ? 'city' : null);

  // step 2
  const [q, setQ] = useState('');
  const [results, setResults] = useState<City[] | null>(null);
  const [searchState, setSearchState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [picked, setPicked] = useState<number | null>(null);
  const [manualCity, setManualCity] = useState('');
  const [timezone, setTimezone] = useState(savedTimeZone ?? 'UTC');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gps, setGps] = useState<'idle' | 'busy' | 'ok' | 'denied'>('idle');
  const [cityError, setCityError] = useState<string>();
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);
  const ids = useId();

  // Browser zone as the manual default, read after hydration (the server does not know it).
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value, read once after hydration
    if (!savedTimeZone && zone && timeZones.includes(zone)) setTimezone(zone);
  }, [savedTimeZone, timeZones]);

  // Debounced search; `q` only travels in the API query string (never logged server-side).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      setSearchState('busy');
      api<{ items: City[] }>(`/geo/cities?q=${encodeURIComponent(term)}`)
        .then(({ data }) => {
          if (ctl.signal.aborted) return;
          setResults(data.items);
          setPicked(data.items.length ? 0 : null);
          setSearchState('idle');
        })
        .catch(() => !ctl.signal.aborted && (setResults([]), setSearchState('error')));
    }, 300);
    return () => {
      ctl.abort();
      clearTimeout(id);
    };
  }, [q]);

  function continueToCity(e: FormEvent) {
    e.preventDefault();
    // Another language: reload the screen in it (the URL carries the step, the locale is the path).
    if (chosen !== locale) router.push(`/${chosen}/onboarding?step=city`);
    else setStep(2);
  }

  function locate() {
    if (!('geolocation' in navigator)) return setGps('denied');
    setGps('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ latitude: Math.round(p.coords.latitude * 1e4) / 1e4, longitude: Math.round(p.coords.longitude * 1e4) / 1e4 });
        setGps('ok');
      },
      () => setGps('denied'), // denial or failure never blocks: the city is chosen by hand
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const candidate = picked !== null && results ? results[picked] : undefined;
    const manual = manualCity.trim();
    if (!candidate && !manual) {
      setCityError(t('cityRequired'));
      searchRef.current?.focus();
      return;
    }
    setCityError(undefined);
    const body = candidate
      ? { locale, cityName: candidate.name, countryCode: candidate.countryCode, timezone: candidate.timezone, ...(coords ?? { latitude: candidate.latitude, longitude: candidate.longitude }) }
      : { locale, cityName: manual, timezone, ...(coords ?? {}) };
    setBusy(true);
    setNotice(null);
    try {
      await api('/me/onboarding', { method: 'POST', body });
      router.replace(`/${locale}/settings/profile`);
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return router.replace(`/${locale}/login`);
      setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  const progress = (n: 1 | 2, name: string) => (
    <div className="mb-3.5">
      <p className="mb-1.5 text-[13px] font-extrabold text-muted">{t('step', { n, name })}</p>
      <div className="flex gap-1" role="img" aria-label={t('stepShort', { n })}>
        {[1, 2].map((i) => (
          <i key={i} className={`h-1.5 flex-1 rounded ${i <= n ? 'bg-primary' : 'bg-neutral-soft'}`} />
        ))}
      </div>
    </div>
  );

  if (step === 1)
    return (
      <form onSubmit={continueToCity}>
        {progress(1, t('languageStep'))}
        <h1 className={H1}>{t('languageTitle')}</h1>
        <p className={LEAD}>{t('languageLead')}</p>
        <fieldset className="mb-3.5 min-w-0">
          <legend className="sr-only">{t('languageLegend')}</legend>
          {LOCALES.map((l) => (
            <div key={l} className={OPTION}>
              <input type="radio" name="locale" id={`${ids}-${l}`} value={l} checked={chosen === l} onChange={() => setChosen(l)} className="size-[22px] flex-none accent-primary" />
              <label htmlFor={`${ids}-${l}`} lang={l} className="flex min-h-12 flex-1 cursor-pointer items-center">
                {NATIVE[l]}
              </label>
            </div>
          ))}
        </fieldset>
        <Button variant="primary" type="submit" className={BLOCK}>
          {t('continue')}
        </Button>
      </form>
    );

  const term = q.trim();
  return (
    <form noValidate onSubmit={finish}>
      {progress(2, t('cityStep'))}
      <h1 ref={headingRef} tabIndex={-1} className={H1}>
        {t('cityTitle')}
      </h1>
      <p className={LEAD}>{t('cityLead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" {...notice} />
        </div>
      )}
      <TextField
        ref={searchRef}
        label={t('search')}
        type="search"
        autoComplete="off"
        hint={t('searchHint')}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) setResults(null);
        }}
        error={cityError}
      />
      <div aria-live="polite" className="mt-3">
        {searchState === 'busy' && <p className="text-sm text-muted">{t('searching')}</p>}
        {searchState === 'error' && <p className="text-sm text-muted">{t('searchError')}</p>}
        {searchState === 'idle' && results?.length === 0 && term.length >= 2 && <p className="text-sm text-muted">{t('noResults', { q: term })}</p>}
      </div>
      {results && results.length > 0 && (
        <fieldset className="mb-3.5 min-w-0">
          <legend className="sr-only">{t('results')}</legend>
          {results.map((c, i) => (
            <div key={`${c.name}-${c.timezone}-${i}`} className={OPTION}>
              <input type="radio" name="city" id={`${ids}-c${i}`} checked={picked === i} onChange={() => setPicked(i)} className="size-[22px] flex-none accent-primary" />
              <label htmlFor={`${ids}-c${i}`} className="flex min-h-12 flex-1 cursor-pointer items-center justify-between gap-2">
                <span>{c.name}</span>
                <small className="font-medium text-muted" dir="ltr">
                  {c.countryCode} · {c.timezone}
                </small>
              </label>
            </div>
          ))}
        </fieldset>
      )}

      {gps === 'denied' && (
        <div className="mb-3">
          <Notice tone="info" icon="info" title={t('gpsDeniedTitle')} text={t('gpsDeniedText')} />
        </div>
      )}
      {gps === 'ok' && (
        <div className="mb-3">
          <Notice tone="success" title={t('gpsOkTitle')} text={t('gpsOkText')} />
        </div>
      )}
      <Button variant="outline" className={BLOCK} onClick={locate} aria-describedby={`${ids}-gps`} aria-disabled={gps === 'busy' || undefined}>
        <Icon name="pin" />
        {t('gps')}
      </Button>
      <p id={`${ids}-gps`} className="mt-1.5 text-sm text-muted">
        {t('gpsHint')}
      </p>

      <h2 className={SECTION}>{t('manualTitle')}</h2>
      <div className="flex flex-col gap-3.5">
        <TextField label={t('manualCity')} autoComplete="address-level2" value={manualCity} onChange={(e) => (setManualCity(e.target.value), e.target.value.trim() && setPicked(null))} />
        <div className={FIELD}>
          <label htmlFor={`${ids}-tz`} className="text-sm font-bold">
            {t('timezone')}
          </label>
          <select id={`${ids}-tz`} dir="ltr" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="min-h-13 rounded-card border-[1.5px] border-border bg-surface px-3.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {timeZones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || undefined}>
          {t('finish')}
        </Button>
        {initialStep === 1 && (
          <Button variant="outline" className={BLOCK} onClick={() => setStep(1)}>
            {c('back')}
          </Button>
        )}
      </div>
    </form>
  );
}
