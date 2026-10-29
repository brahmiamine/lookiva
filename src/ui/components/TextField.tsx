import { useId, type ComponentProps } from 'react';
import { Icon } from './Icon';

// React 19: `ref` is a plain prop, spread onto the input with the rest.
export function TextField({
  label,
  error,
  hint,
  className = '',
  id,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...rest
}: { label: string; error?: string; hint?: string } & ComponentProps<'input'>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  return (
    <div className="flex flex-col gap-1 font-sans">
      <label htmlFor={inputId} className="text-sm font-bold text-text">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={[describedBy, hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
        className={`min-h-13 rounded-card border-[1.5px] bg-surface px-3.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${error ? 'border-danger' : 'border-border'} ${className}`}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm font-bold text-danger">
          <Icon name="warn" className="mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
