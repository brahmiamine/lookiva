'use client';
import { useState } from 'react';
import type { Locale } from '@/i18n/config';
import { Button } from '@/ui/components/Button';
import { Dialog } from '@/ui/components/Dialog';
import { MonthCalendar } from '@/ui/components/MonthCalendar';

export type DevUiDemoLabels = {
  calendarTitle: string;
  calendarNone: string;
  calendarSelectedPrefix: string;
  dialogTitle: string;
  dialogOpen: string;
  dialogBody: string;
  dialogClose: string;
};

// Interactive pieces of the dev page (the page itself is a server component).
export function DevUiDemo({
  locale,
  year,
  month,
  labels,
}: {
  locale: Locale;
  year: number;
  month: number;
  labels: DevUiDemoLabels;
}) {
  const [selected, setSelected] = useState<Date>();
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{labels.calendarTitle}</h2>
        <MonthCalendar year={year} month={month} locale={locale} selected={selected} onSelect={setSelected} />
        <p className="text-muted" aria-live="polite">
          {selected
            ? `${labels.calendarSelectedPrefix} ${new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { dateStyle: 'full', timeZone: 'UTC' }).format(selected)}`
            : labels.calendarNone}
        </p>
      </section>
      <section className="flex flex-col items-start gap-3">
        <h2 className="text-lg font-semibold">{labels.dialogTitle}</h2>
        <Button variant="primary" onClick={() => setOpen(true)}>
          {labels.dialogOpen}
        </Button>
        <Dialog open={open} onOpenChange={setOpen} title={labels.dialogTitle} closeLabel={labels.dialogClose}>
          <p>{labels.dialogBody}</p>
        </Dialog>
      </section>
    </>
  );
}
