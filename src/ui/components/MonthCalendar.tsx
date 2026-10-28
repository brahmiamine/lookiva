import type { Locale } from '@/i18n/config';

// Calendar-DAY granularity, no timezone drift: every date is built at noon UTC (`Date.UTC(y, m - 1, d, 12)`), formatted
// with timeZone 'UTC', and `selected` is compared by its UTC year/month/day. Pass `selected` built the same way.
// Known limit: keyboard use is Tab + Enter/Space on native buttons; arrow-key grid navigation is not implemented.
const at = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));

export function MonthCalendar({
  year,
  month,
  locale,
  weekStartsOn = 1,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  locale: Locale;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  selected?: Date;
  onSelect: (d: Date) => void;
}) {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone: 'UTC', ...o });
  const title = fmt({ month: 'long', year: 'numeric' }).format(at(year, month, 1));
  // 2023-01-01 is a Sunday: reference dates for the weekday names.
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const ref = at(2023, 1, 1 + ((weekStartsOn + i) % 7));
    return { short: fmt({ weekday: 'short' }).format(ref), long: fmt({ weekday: 'long' }).format(ref) };
  });
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (at(year, month, 1).getUTCDay() - weekStartsOn + 7) % 7;
  const cells: (number | null)[] = [...Array<null>(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const isSelected = (day: number) =>
    selected?.getUTCFullYear() === year && selected.getUTCMonth() === month - 1 && selected.getUTCDate() === day;

  return (
    <table className="w-full table-fixed border-collapse font-sans text-text">
      <caption className="pb-2 text-lg font-semibold">{title}</caption>
      <thead>
        <tr>
          {weekdays.map((w) => (
            <th key={w.long} scope="col" aria-label={w.long} className="p-1 text-sm font-medium text-muted">
              {w.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, w) => (
          <tr key={w}>
            {week.map((day, i) => (
              <td key={i} className="p-0.5 text-center">
                {day !== null && (
                  <button
                    type="button"
                    aria-label={fmt({ dateStyle: 'full' }).format(at(year, month, day))}
                    aria-pressed={isSelected(day)}
                    onClick={() => onSelect(at(year, month, day))}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      isSelected(day) ? 'bg-primary font-bold text-on-primary underline' : 'bg-surface text-text'
                    }`}
                  >
                    {day}
                  </button>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
