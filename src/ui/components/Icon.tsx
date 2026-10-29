// Stroke icons of the direction B mockups (docs/design/mockups). Always decorative: the text next to them carries
// the meaning, so they are aria-hidden.
//
// RTL convention: an icon that points along the reading direction (back, forward, "send" arrows) is `directional`
// and is mirrored in RTL with `rtl:-scale-x-100`. Icons with no inline direction (eye, mail, clock, check...) are not.
const PATHS = {
  back: ['M10 3L5 8l5 5'],
  forward: ['M6 3l5 5-5 5'],
  calendar: ['M2.5 3.5h11v10h-11z', 'M2.5 7h11M5.5 2v3M10.5 2v3'],
  check: ['M3 8.5l3.2 3.2L13 5'],
  warn: ['M8 2.2l6.2 11H1.8z', 'M8 6.6v3M8 11.7h.01'],
  info: ['M8 2.2a5.8 5.8 0 100 11.6A5.8 5.8 0 008 2.2z', 'M8 7.4v3.4M8 5.2h.01'],
  clock: ['M8 2a6 6 0 100 12A6 6 0 008 2z', 'M8 4.7v3.3l2 1.3'],
  mail: ['M2 3.3h12v9.4H2z', 'M2.3 4.7L8 8.7l5.7-4'],
  eye: ['M1.3 8S3.7 3.7 8 3.7 14.7 8 14.7 8 12.3 12.3 8 12.3 1.3 8 1.3 8z', 'M8 6a2 2 0 100 4 2 2 0 000-4z'],
  eyeOff: ['M2 2l12 12', 'M7.1 3.7A6.7 6.7 0 018 3.7C12.3 3.7 14.7 8 14.7 8a11 11 0 01-2 2.5M4.3 4.6A11 11 0 001.3 8s2.4 4.3 6.7 4.3c1.1 0 2-.3 2.8-.7', 'M6.6 6.6a2 2 0 002.8 2.8'],
  pin: ['M8 14s4.7-4 4.7-7.7a4.7 4.7 0 00-9.4 0C3.3 10 8 14 8 14z', 'M8 4.7a1.7 1.7 0 100 3.4 1.7 1.7 0 000-3.4z'],
  phone: ['M4.7 1.7h6.6v12.6H4.7z', 'M7.3 12.3h1.4'],
  laptop: ['M2.7 3.3h10.6v7.4H2.7z', 'M1.3 12.7h13.4'],
  logout: ['M6.7 2.7H3.3v10.6h3.4', 'M10 5.3L12.7 8 10 10.7M12.7 8H6'],
  download: ['M8 2.7v7.3M4.7 7.3L8 10.7l3.3-3.4M3.3 13.3h9.4'],
  trash: ['M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8.5h6.8l.6-8.5M6.8 7v3.8M9.2 7v3.8'],
  drop: ['M8 2.2S3.6 6.8 3.6 9.6a4.4 4.4 0 008.8 0C12.4 6.8 8 2.2 8 2.2z'],
  wind: ['M2 6h6.7a1.7 1.7 0 10-1.6-2M2 9.3h9.3a1.7 1.7 0 11-1.6 2M2 12.7h4'],
  lend: ['M2.5 8h11M9.5 4l4 4-4 4'],
  repair: ['M10.5 3l2.5 2.5L5.5 13H3v-2.5z'],
  plus: ['M8 3v10M3 8h10'],
  copy: ['M5.5 5.5h8v8h-8z', 'M10.5 5.5v-3h-8v8h3'],
  edit: ['M10.5 3l2.5 2.5L5.5 13H3v-2.5z'],
  rotateCw: ['M13 3v3.5H9.5', 'M13 6.5A5.5 5.5 0 102.6 9'],
  rotateCcw: ['M3 3v3.5h3.5', 'M3 6.5A5.5 5.5 0 1113.4 9'],
  camera: ['M2 5h3l1.3-2h3.4L11 5h3v8H2z', 'M8 6.7a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6z'],
  image: ['M2 3h12v10H2z', 'M2 11l3.5-3.5 3 3 2-2L14 12', 'M10.5 5.5h.01'],
  search: ['M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z', 'M10.3 10.3L14 14'],
  shirt: ['M5.7 2.3L2 4.3l1.3 2.8 1.7-.7v7.3h6V6.4l1.7.7L14 4.3l-3.7-2a2.4 2.4 0 01-4.6 0z'],
  star: ['M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z'],
  restore: ['M3 3v3.5h3.5', 'M3 6.5A5.5 5.5 0 1113.4 9'],
  tag: ['M2 2h5.5L14 8.5 8.5 14 2 7.5z', 'M5 5h.01'],
  close: ['M4 4l8 8M12 4l-8 8'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, directional = false, className = '' }: { name: IconName; directional?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={`size-[1.25em] flex-none fill-none stroke-current stroke-2 ${directional ? 'rtl:-scale-x-100' : ''} ${className}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
