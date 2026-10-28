import { useId, type InputHTMLAttributes } from 'react';

export function TextField({
  label,
  error,
  className = '',
  ...rest
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1 font-sans">
      <label htmlFor={id} className="font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-11 rounded-card border bg-surface px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
