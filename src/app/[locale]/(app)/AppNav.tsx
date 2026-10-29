'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/ui/components/Icon';

/** Main navigation of the signed-in screens (mockup bottom bar). Labels come from the server layout. */
export function AppNav({ label, items }: { label: string; items: { href: string; section: string; text: string; icon: IconName }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-soft bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md gap-1 p-1.5">
        {items.map((i) => {
          const current = path === i.section || path.startsWith(`${i.section}/`);
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={current ? 'page' : undefined}
                className="flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-[current=page]:bg-primary aria-[current=page]:font-extrabold aria-[current=page]:text-on-primary"
              >
                <Icon name={i.icon} className="text-xl" />
                {i.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
