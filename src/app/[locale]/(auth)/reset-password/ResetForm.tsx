'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { LoadingState } from '@/ui/components/LoadingState';
import { Notice } from '@/ui/components/Notice';
import { PASSWORD_MIN, PasswordField, PasswordMeter, passwordLength } from '@/ui/components/PasswordField';
import { takeFragmentToken, useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { FORM, H1, HERO, LEAD } from '../styles';

type Screen = 'start' | 'form' | 'success' | 'invalid';
const POLICY = new Set(['too_short', 'too_long', 'too_common', 'matches_email']);

/** The reset token comes from `#token=` (never sent to a server by the browser), is stripped, kept in memory only. */
export function ResetForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const locale = useLocale();
  const genericNotice = useErrorNotice();
  const [screen, setScreen] = useState<Screen>('start');
  const [v, setV] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const token = useRef<string | null>(null);
  const started = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(headingRef, screen === 'success' || screen === 'invalid' ? screen : null);
  useFocusOn(noticeRef, notice);

  useEffect(() => {
    const read = () => {
      const t = takeFragmentToken();
      if (t) token.current = t;
      if (t || !started.current) setScreen(token.current ? 'form' : 'invalid');
      started.current = true;
    };
    if (!started.current) read();
    window.addEventListener('hashchange', read); // a new link opened in this same tab
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const show = (errs: typeof errors) => {
    setErrors(errs);
    const first = errs.password ? passwordRef : errs.confirm ? confirmRef : null;
    first?.current?.focus();
    return first !== null;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (
      show({
        password: !v.password ? c('required') : passwordLength(v.password) < PASSWORD_MIN ? t('password.too_short') : undefined,
        confirm: v.confirm !== v.password ? t('password.mismatch') : undefined,
      })
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      await api('/auth/password/reset', { method: 'POST', idempotent: true, body: { token: token.current, password: v.password } });
      token.current = null;
      setScreen('success');
    } catch (err) {
      const field = err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? err.errors[0] : undefined;
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') setScreen('invalid');
      else if (field?.path === 'password' && POLICY.has(field.message)) show({ password: t(`password.${field.message}`) });
      else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  if (screen === 'start') return <LoadingState title={c('loading')} />;

  if (screen === 'success')
    return (
      <div className="flex flex-col text-center">
        <span className={`${HERO} bg-success-soft text-success`}>
          <Icon name="check" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={H1}>
          {t('reset.successTitle')}
        </h1>
        <p className="mb-4 text-muted">{t('reset.successText')}</p>
        <div className="mb-4 text-start">
          <Notice tone="info" title={t('reset.allSessionsTitle')} text={t('reset.allSessionsText')} />
        </div>
        <Link href={`/${locale}/login`} className={`${BLOCK} inline-flex items-center justify-center rounded-card bg-primary text-on-primary`}>
          {t('reset.login')}
        </Link>
      </div>
    );

  if (screen === 'invalid')
    return (
      <div className="flex flex-col text-center">
        <span className={`${HERO} bg-warning-soft text-warning`}>
          <Icon name="clock" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className={H1}>
          {t('reset.invalidTitle')}
        </h1>
        <p className="mb-4 text-muted">{t('reset.invalidText')}</p>
        <Link href={`/${locale}/forgot-password`} className={`${BLOCK} inline-flex items-center justify-center rounded-card bg-primary text-on-primary`}>
          {t('reset.newLink')}
        </Link>
      </div>
    );

  const pw = { showLabel: c('showPassword'), hideLabel: c('hidePassword'), autoComplete: 'new-password', required: true };
  return (
    <>
      <h1 className={H1}>{t('reset.title')}</h1>
      <p className={LEAD}>{t('reset.lead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" {...notice} />
        </div>
      )}
      <form noValidate onSubmit={submit} className={FORM}>
        <PasswordField
          ref={passwordRef}
          label={t('password.new')}
          name="password"
          hint={t('password.hint')}
          value={v.password}
          onChange={(e) => setV((s) => ({ ...s, password: e.target.value }))}
          error={errors.password}
          meter={<PasswordMeter value={v.password} tooShort={(n) => t('password.tooShortMeter', { count: n })} strong={t('password.strongMeter')} />}
          {...pw}
        />
        <PasswordField
          ref={confirmRef}
          label={t('password.confirm')}
          name="confirm"
          value={v.confirm}
          onChange={(e) => setV((s) => ({ ...s, confirm: e.target.value }))}
          error={errors.confirm}
          {...pw}
        />
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || undefined}>
          {t('reset.submit')}
        </Button>
      </form>
    </>
  );
}
