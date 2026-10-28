import type { ReactNode } from 'react';

export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-card bg-danger-soft p-8 text-center font-sans text-danger">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
