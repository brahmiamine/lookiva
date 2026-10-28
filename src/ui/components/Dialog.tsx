'use client';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 bg-text/50" />
        <D.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 top-1/2 mx-auto flex w-[min(90vw,28rem)] -translate-y-1/2 flex-col gap-4 rounded-card bg-surface p-6 font-sans text-text"
        >
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          {children}
          <D.Close
            aria-label={closeLabel}
            className="absolute end-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span aria-hidden="true">×</span>
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
