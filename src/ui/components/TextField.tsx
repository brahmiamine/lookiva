import { useId, type InputHTMLAttributes } from 'react';

export function TextField({
  label,
  error,
  className = '',
  id,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...rest
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  return (
    <div className="flex flex-col gap-1 font-sans">
      <label htmlFor={inputId} className="font-medium text-text">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={[describedBy, error && errorId].filter(Boolean).join(' ') || undefined}
        className={`min-h-11 rounded-card border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${error ? 'border-danger' : 'border-border'} ${className}`}
      />
      {error && (
        <p id={errorId} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
