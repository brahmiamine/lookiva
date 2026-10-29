import type { ButtonHTMLAttributes } from 'react';

const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-card px-4 font-sans font-medium ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';
const VARIANTS = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-border bg-surface text-text',
  outline: 'border-[1.5px] border-primary bg-surface text-primary',
  danger: 'border-[1.5px] border-danger bg-surface text-danger',
};

/** Full-width form action of the mockups (48px high). */
export const BLOCK = 'w-full min-h-12 text-base font-bold aria-disabled:cursor-not-allowed aria-disabled:border-border aria-disabled:bg-neutral-soft aria-disabled:text-neutral';

export function Button({
  variant,
  className = '',
  type = 'button',
  ...rest
}: { variant: keyof typeof VARIANTS } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest} />;
}
