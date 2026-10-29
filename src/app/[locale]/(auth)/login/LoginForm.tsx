'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api, retryMinutes } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { PasswordField } from '@/ui/components/PasswordField';
import { TextField } from '@/ui/components/TextField';
import { looksLikeEmail, useCountdown, useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { FORM, H1, LEAD, LINK } from '../styles';

export function LoginForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [notice, setNotice] = useState<(NoticeData & { verifyLink?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const left = useCountdown(lockedUntil);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || left > 0) return;
    const errs = {
      email: !email.trim() ? c('required') : !looksLikeEmail(email) ? c('invalidEmail') : undefined,
      password: !password ? c('required') : undefined,
    };
    setErrors(errs);
    if (errs.email || errs.password) {
      (errs.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      // The guarded page reads the new session cookie server-side (and sends to onboarding when it is not done).
      router.replace(`/${locale}/settings/profile`);
      return;
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS')
        setNotice({ tone: 'danger', title: t('login.invalidTitle'), text: t('login.invalidText') });
      else if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED')
        setNotice({ tone: 'info', title: t('login.notVerifiedTitle'), text: t('login.notVerifiedText'), verifyLink: true });
      else if (err instanceof ApiError && err.status === 429) {
        setLockedUntil(Date.now() + retryMinutes(err) * 60_000);
        setNotice({ tone: 'warning', title: c('rateLimitedTitle', { minutes: retryMinutes(err) }), text: t('login.limitedText') });
      } else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>{t('login.title')}</h1>
      <p className={LEAD}>{t('login.lead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" tone={notice.tone} title={notice.title} text={notice.text}>
            {notice.verifyLink && (
              <Link className={LINK} href={`/${locale}/verify-email`}>
                {t('login.notVerifiedLink')}
              </Link>
            )}
          </Notice>
        </div>
      )}
      <form noValidate onSubmit={submit} className={FORM}>
        <TextField
          ref={emailRef}
          label={c('email')}
          type="email"
          name="email"
          dir="ltr"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField
          ref={passwordRef}
          label={c('password')}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          showLabel={c('showPassword')}
          hideLabel={c('hidePassword')}
        />
        <div className="flex justify-end">
          <Link className={LINK} href={`/${locale}/forgot-password`}>
            {t('login.forgot')}
          </Link>
        </div>
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || left > 0 || undefined}>
          {left > 0 ? (
            <>
              <Icon name="clock" />
              {c('retryInMinutes', { minutes: Math.ceil(left / 60) })}
            </>
          ) : (
            t('login.submit')
          )}
        </Button>
      </form>
      <p className="mt-3.5 flex flex-wrap items-center justify-center text-[15px]">
        <span className="text-muted">{t('login.noAccount')}</span>
        <Link className={LINK} href={`/${locale}/register`}>
          {t('login.create')}
        </Link>
      </p>
    </>
  );
}
