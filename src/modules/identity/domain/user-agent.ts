// Order matters: Edge and Chrome UAs also say "Safari", iOS UAs also say "Mac OS X".
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** Coarse "Browser on OS" label: enough to recognise a device in the session list, without storing a fingerprint. */
export function summariseUserAgent(ua: string | null): string {
  const pick = (table: [RegExp, string][]) => table.find(([re]) => ua !== null && re.test(ua))?.[1];
  return `${pick(BROWSERS) ?? 'Unknown browser'} on ${pick(SYSTEMS) ?? 'unknown OS'}`;
}
