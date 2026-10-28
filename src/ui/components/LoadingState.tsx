import type { ReactNode } from 'react';

export function LoadingState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col items-center gap-2 p-8 text-center font-sans text-muted">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
