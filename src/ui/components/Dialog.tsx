'use client';
import { Dialog as D } from 'radix-ui';
import { useRef, type ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  /** Short explanation read with the title (aria-describedby). */
  description?: string;
  children: ReactNode;
}) {
  // Controlled dialog without <D.Trigger>: Radix has no trigger to return focus to, so remember the opener ourselves.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-text/50" />
        <D.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[90dvh] w-[min(90vw,28rem)] -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card bg-surface p-6 font-sans text-text"
        >
          <D.Title className="pe-10 text-lg font-semibold">{title}</D.Title>
          {description && <D.Description className="text-sm text-muted">{description}</D.Description>}
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
