'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { Bdi } from '@/ui/components/Bdi';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { LoadingState } from '@/ui/components/LoadingState';
import { Notice } from '@/ui/components/Notice';
import { TextField } from '@/ui/components/TextField';
import { looksLikeEmail, takeFragmentToken, useCountdown, useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { COOLDOWN_MS, readPendingEmail, rememberPendingEmail } from '../pending-email';
import { H1, HERO, LINK } from '../styles';

type Screen = 'start' | 'checking' | 'pending' | 'success' | 'invalid';

/**
 * Without a token: "check your email" + resend (60 s cooldown). With `#token=` (from the mail): the token is read
 * client-side, stripped from the URL, POSTed once; it never reaches a query string, a server log or a Referer.
 */
export function VerifyEmail() {
  const t = useTranslations('auth.verify');
  const c = useTranslations('common');
  const locale = useLocale();
  const genericNotice = useErrorNotice();
  const [screen, setScreen] = useState<Screen>('start');
  const [email, setEmail] = useState('');
  const [knownEmail, setKnownEmail] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [notice, setNotice] = useState<(NoticeData & { role: 'alert' | 'status' }) | null>(null);
  const left = useCountdown(cooldownUntil);
  const started = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useFocusOn(headingRef, screen === 'success' || screen === 'invalid' ? screen : null);
  useFocusOn(noticeRef, notice);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser-only state (URL fragment,
     sessionStorage) after hydration; the server cannot render it */
  useEffect(() => {
    const verify = () => {
      const token = takeFragmentToken();
      if (!token) return false;
      setScreen('checking');
      api('/auth/email/verify', { method: 'POST', body: { token } })
        .then(() => setScreen('success'))
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'INVALID_TOKEN') setScreen('invalid');
          else {
            setScreen('pending');
            setNotice({ ...genericNotice(e), role: 'alert' });
          }
        });
      return true;
    };
    if (!started.current) {
      started.current = true; // StrictMode runs effects twice: the token is single-use
      const pending = readPendingEmail();
      if (pending) {
        setEmail(pending.email);
        setKnownEmail(true);
        if (Date.now() - pending.sentAt < COOLDOWN_MS) setCooldownUntil(pending.sentAt + COOLDOWN_MS);
      }
      if (!verify()) setScreen('pending');
    }
    // A link opened in the tab already showing this page only changes the fragment.
    window.addEventListener('hashchange', verify);
    return () => window.removeEventListener('hashchange', verify);
  }, [genericNotice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function resend(e: FormEvent) {
    e.preventDefault();
    if (left > 0) return;
    if (!looksLikeEmail(email)) {
      setEmailError(email.trim() ? c('invalidEmail') : c('required'));
      emailRef.current?.focus();
      return;
    }
    setEmailError(undefined);
    try {
      await api('/auth/email/resend', { method: 'POST', body: { email: email.trim() } });
      rememberPendingEmail(email.trim());
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setNotice({ tone: 'success', title: t('resent'), role: 'status' });
    } catch (err) {
      setNotice({ ...genericNotice(err), role: 'alert' });
    }
  }

  if (screen === 'start' || screen === 'checking') return <LoadingState title={t('checking')} />;

  if (screen === 'success')
    return (
      <div className="text-center">
        <span className={`${HERO} bg-success-soft text-success`}>
          <Icon name="check" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={H1}>
          {t('successTitle')}
        </h1>
        <p className="mb-4 text-muted">{t('successText')}</p>
        <Link href={`/${locale}/login`} className={`${BLOCK} inline-flex items-center justify-center rounded-card bg-primary text-on-primary`}>
          {t('continue')}
        </Link>
      </div>
    );

  if (screen === 'invalid')
    return (
      <div className="text-center">
        <span className={`${HERO} bg-warning-soft text-warning`}>
          <Icon name="clock" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={H1}>
          {t('invalidTitle')}
        </h1>
        <p className="mb-4 text-muted">{t('invalidText')}</p>
        <Button variant="primary" className={BLOCK} onClick={() => setScreen('pending')}>
          {t('newLink')}
        </Button>
      </div>
    );

  return (
    <>
      <div className="text-center">
        <span className={`${HERO} bg-info-soft text-info`}>
          <Icon name="mail" />
        </span>
        <h1 className={H1}>{t('title')}</h1>
        <p className="mb-4 text-muted">{t('text')}</p>
        {knownEmail && (
          <p className="mb-4 font-bold" data-testid="pending-email">
            <Bdi>{email}</Bdi>
          </p>
        )}
      </div>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} {...notice} />
        </div>
      )}
      <form noValidate onSubmit={resend} className="flex flex-col gap-3">
        {!knownEmail && (
          <TextField
            ref={emailRef}
            label={c('email')}
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
        )}
        <Button variant="outline" type="submit" className={BLOCK} aria-disabled={left > 0 || undefined} aria-describedby={left > 0 ? 'cooldown' : undefined}>
          <Icon name={left > 0 ? 'clock' : 'mail'} />
          {left > 0 ? t('resendIn', { seconds: left }) : t('resend')}
        </Button>
        {left > 0 && (
          <p id="cooldown" className="text-center text-sm text-muted">
            {t('cooldown')}
          </p>
        )}
      </form>
      <p className="mt-3.5 flex justify-center">
        <Link className={LINK} href={`/${locale}/register`}>
          {t('otherAddress')}
        </Link>
      </p>
    </>
  );
}
