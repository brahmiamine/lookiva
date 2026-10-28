import type { ReactNode } from 'react';

type StateProps = { title: string; description?: string; action?: ReactNode };

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <section className="flex flex-col items-center gap-2 p-8 text-center font-sans text-text">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-muted">{description}</p>}
      {action}
    </section>
  );
}
