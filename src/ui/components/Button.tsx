import type { ButtonHTMLAttributes } from 'react';

const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-card px-4 font-sans font-medium ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50';
const VARIANTS = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-border bg-surface text-text',
};

export function Button({
  variant,
  className = '',
  type = 'button',
  ...rest
}: { variant: keyof typeof VARIANTS } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest} />;
}
