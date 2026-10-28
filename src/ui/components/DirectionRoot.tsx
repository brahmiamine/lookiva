'use client';
import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';

// Client wrapper so the (server) locale layout can provide Radix with the text direction.
export function DirectionRoot({ dir, children }: { dir: 'ltr' | 'rtl'; children: ReactNode }) {
  return <Direction.DirectionProvider dir={dir}>{children}</Direction.DirectionProvider>;
}
