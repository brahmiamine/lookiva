'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '@/ui/api-client';
import { BLOCK, Button } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Notice } from '@/ui/components/Notice';
import { PASSWORD_MIN, PasswordField, PasswordMeter, passwordLength } from '@/ui/components/PasswordField';
import { TextField } from '@/ui/components/TextField';
import { looksLikeEmail, useErrorNotice, useFocusOn, type NoticeData } from '@/ui/form-helpers';
import { rememberPendingEmail } from '../pending-email';
import { FORM, H1, LEAD, LINK } from '../styles';

type Field = 'email' | 'password' | 'confirm' | 'terms';
const POLICY = new Set(['too_short', 'too_long', 'too_common', 'matches_email']);

export function RegisterForm() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const genericNotice = useErrorNotice();
  const [v, setV] = useState({ email: '', password: '', confirm: '', terms: false });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOn(noticeRef, notice);

  const show = (errs: Partial<Record<Field, string>>) => {
    setErrors(errs);
    const first = (['email', 'password', 'confirm', 'terms'] as const).find((f) => errs[f]);
    if (first) ({ email: emailRef, password: passwordRef, confirm: confirmRef, terms: termsRef })[first].current?.focus();
    return Boolean(first);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const invalid = show({
      email: !v.email.trim() ? c('required') : !looksLikeEmail(v.email) ? c('invalidEmail') : undefined,
      password: !v.password ? c('required') : passwordLength(v.password) < PASSWORD_MIN ? t('password.too_short') : undefined,
      confirm: v.confirm !== v.password ? t('password.mismatch') : undefined,
      terms: v.terms ? undefined : t('register.termsRequired'),
    });
    if (invalid) return;
    setBusy(true);
    setNotice(null);
    try {
      await api('/auth/register', { method: 'POST', idempotent: true, body: { email: v.email.trim(), password: v.password, locale } });
      rememberPendingEmail(v.email.trim());
      router.push(`/${locale}/verify-email`);
      return;
    } catch (err) {
      const field = err instanceof ApiError && err.code === 'VALIDATION_ERROR' ? err.errors[0] : undefined;
      if (field?.path === 'password' && POLICY.has(field.message)) show({ password: t(`password.${field.message}`) });
      else if (field?.path === 'email') show({ email: c('invalidEmail') });
      else if (err instanceof ApiError && err.status === 429) setNotice({ ...genericNotice(err), text: t('register.limitedText') });
      else setNotice(genericNotice(err));
    }
    setBusy(false);
  }

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: k === 'terms' ? e.target.checked : e.target.value }));
  const pw = { showLabel: c('showPassword'), hideLabel: c('hidePassword'), autoComplete: 'new-password', required: true };

  return (
    <>
      <h1 className={H1}>{t('register.title')}</h1>
      <p className={LEAD}>{t('register.lead')}</p>
      {notice && (
        <div className="mb-3.5">
          <Notice ref={noticeRef} role="alert" {...notice} />
        </div>
      )}
      <form noValidate onSubmit={submit} className={FORM}>
        <TextField ref={emailRef} label={c('email')} type="email" name="email" dir="ltr" autoComplete="username" required value={v.email} onChange={set('email')} error={errors.email} />
        <PasswordField
          ref={passwordRef}
          label={c('password')}
          name="password"
          hint={t('password.hint')}
          value={v.password}
          onChange={set('password')}
          error={errors.password}
          meter={<PasswordMeter value={v.password} tooShort={(n) => t('password.tooShortMeter', { count: n })} strong={t('password.strongMeter')} />}
          {...pw}
        />
        <PasswordField ref={confirmRef} label={t('password.confirm')} name="confirm" value={v.confirm} onChange={set('confirm')} error={errors.confirm} {...pw} />
        <div className="flex items-start gap-2.5 text-sm">
          <input
            ref={termsRef}
            id="terms"
            type="checkbox"
            required
            checked={v.terms}
            onChange={set('terms')}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            className="mt-2.5 size-6 flex-none accent-primary"
          />
          <div className="flex flex-col">
            <label htmlFor="terms" className="flex min-h-11 items-center">
              {t('register.terms')}
            </label>
            {errors.terms && (
              <p id="terms-error" role="alert" className="flex items-start gap-1.5 font-bold text-danger">
                <Icon name="warn" className="mt-0.5" />
                <span>{errors.terms}</span>
              </p>
            )}
          </div>
        </div>
        <Button variant="primary" type="submit" className={BLOCK} aria-disabled={busy || undefined}>
          {t('register.submit')}
        </Button>
      </form>
      <p className="mt-3.5 flex flex-wrap items-center justify-center text-[15px]">
        <span className="text-muted">{t('register.hasAccount')}</span>
        <Link className={LINK} href={`/${locale}/login`}>
          {t('register.login')}
        </Link>
      </p>
    </>
  );
}
