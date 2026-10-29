'use client';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

type Props = { label: string; hint?: string; error?: string; showLabel: string; hideLabel: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
>;

/** Password input with a show/hide toggle. Value never leaves the component except through the form. */
export const PasswordField = forwardRef<HTMLInputElement, Props & { meter?: React.ReactNode }>(function PasswordField(
  { label, hint, error, showLabel, hideLabel, meter, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const [shown, setShown] = useState(false);
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5 font-sans">
      <label htmlFor={inputId} className="text-sm font-bold text-text">
        {label}
      </label>
      <div className="relative flex">
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={shown ? 'text' : 'password'}
          dir="ltr"
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-13 w-full rounded-card border-[1.5px] bg-surface ps-3.5 pe-14 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${error ? 'border-2 border-danger' : 'border-border'}`}
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-label={shown ? hideLabel : showLabel}
          onClick={() => setShown((v) => !v)}
          className="absolute end-1 top-1 inline-flex size-11 items-center justify-center rounded-[10px] text-xl text-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {hint && (
        <p id={`${inputId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {meter}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-bold text-danger">
          <Icon name="warn" className="mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});

export const PASSWORD_MIN = 12;
/** Policy length = Unicode code points (same rule as the server). */
export const passwordLength = (v: string) => [...v].length;

/** Mockup meter: 1 bar "too short: n of 12" below the minimum, 3 bars "strong" from it. Empty value: nothing. */
export function PasswordMeter({ value, tooShort, strong }: { value: string; tooShort: (n: number) => string; strong: string }) {
  const n = passwordLength(value);
  if (n === 0) return <div role="status" />;
  const ok = n >= PASSWORD_MIN;
  return (
    <div role="status" className={`flex items-center gap-2.5 ${ok ? 'text-success' : 'text-warning'}`}>
      <div aria-hidden="true" className="flex flex-1 gap-1">
        {[0, 1, 2].map((i) => (
          <i key={i} className={`h-2 flex-1 rounded border ${ok || i === 0 ? 'border-current bg-current' : 'border-border bg-neutral-soft'}`} />
        ))}
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-bold">
        <Icon name={ok ? 'check' : 'warn'} />
        {ok ? strong : tooShort(n)}
      </span>
    </div>
  );
}
