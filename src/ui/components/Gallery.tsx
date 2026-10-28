import { Children, type ReactNode } from 'react';

// 2 columns on mobile, more on wider screens. Each child (a card) becomes a list item.
export function Gallery({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Children.toArray(children).map((child, i) => (
        <li key={i} className="flex">
          {child}
        </li>
      ))}
    </ul>
  );
}
