import type { ReactNode } from 'react';
import { Bdi } from './Bdi';

// `pieceCountLabel` is the already-formatted visible text ("4 pièces"); `pieceCount` is only exposed as data.
export function OutfitCard({
  title,
  occasion,
  pieceCount,
  pieceCountLabel,
  badge,
}: {
  title: string;
  occasion?: string;
  pieceCount: number;
  pieceCountLabel: string;
  badge?: ReactNode;
}) {
  return (
    <article
      data-piece-count={pieceCount}
      className="flex w-full flex-col items-start gap-2 rounded-card border border-neutral-soft bg-surface p-3 font-sans text-text shadow-sm"
    >
      <h3 className="text-base font-bold">
        <Bdi>{title}</Bdi>
      </h3>
      {occasion && (
        <p className="text-sm text-muted">
          <Bdi>{occasion}</Bdi>
        </p>
      )}
      <p className="text-sm font-medium">{pieceCountLabel}</p>
      {badge}
    </article>
  );
}
