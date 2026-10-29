'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api, retryMinutes } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { looksLikeEmail, useCountdown, useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { FORM, H1, HERO, LEAD, LINK } from '../styles';

export function ForgotForm() {
  const t = useTranslations('auth.forgot');
  const c = useTranslations('common');
  const locale = useLocale();
  const genericNotice = useErrorNotice();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const left = useCountdown(lockedUntil);
  const emailRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOn(noticeRef, notice);
  useFocusOn(headingRef, sent);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || left > 0) return;
    if (!looksLikeEmail(email)) {
      setError(email.trim() ? c('invalidEmail') : c('required'));
      emailRef.current?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    setNotice(null);
    try {
      await api('/auth/password/forgot', { method: 'POST', idempotent: true, body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + retryMinutes(err) * 60_000);
        setNotice({ tone: 'warning', title: t('limitedTitle', { minutes: retryMinutes(err) }) });
      } else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  const back = (
    <p className="mt-3.5 flex justify-center">
      <Link className={LINK} href={`/${locale}/login`}>
        {t('backToLogin')}
      </Link>
    </p>
  );

  if (sent)
    return (
      <div className="text-center">
        <span className={`${HERO} bg-info-soft text-info`}>
          <Icon name="mail" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={H1}>
          {t('sentTitle')}
        </h1>
        <p className="text-muted">{t('sentText')}</p>
        {back}
      </div>
    );

  return (
    <>
      <h1 className={H1}>{t('title')}</h1>
      <p className={LEAD}>{t('lead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" {...notice} />
        </div>
      )}
      <form noValidate onSubmit={submit} className={FORM}>
        <TextField ref={emailRef} label={c('email')} type="email" name="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || left > 0 || undefined}>
          {left > 0 ? (
            <>
              <Icon name="clock" />
              {c('retryInMinutes', { minutes: Math.ceil(left / 60) })}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>
      {back}
    </>
  );
}
