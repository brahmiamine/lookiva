// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../setup/dom-polyfills';
import { MonthCalendar } from '@/ui/components/MonthCalendar';

afterEach(cleanup);

const noop = () => {};
const dayButtons = () => screen.getAllByRole('button');
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
const blanksBeforeDayOne = () => {
  const cells = Array.from(document.querySelectorAll('tbody td'));
  return cells.findIndex((c) => c.querySelector('button'));
};

describe('MonthCalendar', () => {
  it('calendar_renders_28_29_30_31_days_correctly', () => {
    const cases: [number, number, number][] = [
      [2027, 2, 28],
      [2028, 2, 29],
      [2026, 4, 30],
      [2026, 1, 31],
    ];
    for (const [year, month, days] of cases) {
      const { unmount } = render(<MonthCalendar year={year} month={month} locale="fr" onSelect={noop} />);
      expect(dayButtons(), `${year}-${month}`).toHaveLength(days);
      unmount();
    }
  });

  it('calendar_weekday_names_follow_locale', () => {
    const { unmount: u1 } = render(<MonthCalendar year={2026} month={4} locale="fr" weekStartsOn={1} onSelect={noop} />);
    expect(headers()[0]?.toLowerCase().startsWith('lun')).toBe(true);
    expect(headers()).toHaveLength(7);
    u1();

    const { unmount: u2 } = render(<MonthCalendar year={2026} month={4} locale="en" weekStartsOn={0} onSelect={noop} />);
    expect(headers()[0]?.startsWith('Sun')).toBe(true);
    u2();

    // 2023-01-01 is a Sunday: weekStartsOn 6 gives Saturday first.
    const fmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'short', timeZone: 'UTC' });
    const expected = [6, 0, 1, 2, 3, 4, 5].map((dow) => fmt.format(new Date(Date.UTC(2023, 0, 1 + dow, 12))));
    render(<MonthCalendar year={2026} month={4} locale="ar" weekStartsOn={6} onSelect={noop} />);
    expect(headers()).toEqual(expected);
    expect(headers().every((h) => /\p{Script=Arabic}/u.test(h ?? ''))).toBe(true);
  });

  it('calendar_first_day_offset_respects_weekStartsOn', () => {
    // 1 February 2028 is a Tuesday.
    const { unmount } = render(<MonthCalendar year={2028} month={2} locale="en" weekStartsOn={1} onSelect={noop} />);
    expect(blanksBeforeDayOne()).toBe(1);
    unmount();
    render(<MonthCalendar year={2028} month={2} locale="en" weekStartsOn={0} onSelect={noop} />);
    expect(blanksBeforeDayOne()).toBe(2);
  });

  it('calendar_day_buttons_are_keyboard_operable', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MonthCalendar year={2026} month={4} locale="fr" onSelect={onSelect} />);
    await user.tab();
    expect(document.activeElement).toBe(dayButtons()[0]);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(new Date(Date.UTC(2026, 3, 1, 12)));

    await user.tab();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(new Date(Date.UTC(2026, 3, 2, 12)));
  });

  it('calendar_selected_day_has_aria_pressed_true', () => {
    render(
      <MonthCalendar year={2026} month={4} locale="en" selected={new Date(Date.UTC(2026, 3, 15, 12))} onSelect={noop} />,
    );
    const pressed = dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.textContent).toBe('15');
    expect(dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'false')).toHaveLength(29);
    expect(pressed[0]?.getAttribute('aria-label')).toContain('April 15, 2026');
  });
});
