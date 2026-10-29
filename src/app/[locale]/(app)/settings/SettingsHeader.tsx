import Link from 'next/link';
import { Icon } from '@/ui/components/Icon';

/** Mockup settings header: back link (directional icon, mirrored in RTL), centred title. */
export function SettingsHeader({ title, backHref, backLabel }: { title: string; backHref?: string; backLabel: string }) {
  return (
    <header className="flex items-center justify-between gap-3 pt-5 pb-1">
      {backHref ? (
        <Link href={backHref} aria-label={backLabel} className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <Icon name="back" directional />
        </Link>
      ) : (
        <span className="w-11" />
      )}
      <p className="text-lg font-bold">{title}</p>
      <span className="w-11" />
    </header>
  );
}
