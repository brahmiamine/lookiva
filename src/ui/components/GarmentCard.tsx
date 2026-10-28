import Image from 'next/image';
import type { ReactNode } from 'react';
import { Bdi } from './Bdi';

// next/image with `unoptimized`: photos are private signed URLs, so they must not go through the public optimizer.
export function GarmentCard({ name, photoUrl, badge }: { name: string; photoUrl?: string; badge: ReactNode }) {
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-card border border-neutral-soft bg-surface font-sans text-text shadow-sm">
      <div className="relative aspect-[5/4] bg-neutral-soft text-neutral">
        {photoUrl ? (
          // The name is shown right below, so the image is decorative.
          <Image src={photoUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
        ) : (
          <div data-slot="placeholder" aria-hidden="true" className="grid h-full w-full place-items-center">
            <svg viewBox="0 0 24 24" className="size-11 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 3.5L3 6.5l2 4.2 2.5-1.1V20.5h9V9.6l2.5 1.1 2-4.2-5.5-3a3.6 3.6 0 01-7 0z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 p-3">
        <h3 className="text-base font-bold">
          <Bdi>{name}</Bdi>
        </h3>
        {badge}
      </div>
    </article>
  );
}
